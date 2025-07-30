/*
// regular dl2 component syntax
// autoimported via the importmap stuff or manually mounted with `mount("selector or array of els", DropdownController)`
export let DropdownController: Component<{}, {
	hidden: boolean,
}> = function(cx) {
	this.hidden = true;

	cx.mount = () => {
		// cx.root points to the controller root
		console.log(cx.root.outerHTML);
	}

	// return a bunch of mount points as a Fragment
	// mount points have dl-ssr to figure out where to mount them, id matches "dl-ssr-id=..."
	// any children/components or other props will just get added onto or modify the element
	return <>
		<button dl-ssr={{ id: "abc" }} on:click={() => this.hidden = false} />
		<div dl-ssr={{ id: "menu" }} class:hidden={use(this.hidden)}>
			<span>hydrated in content</span>
		</div>
	</>
}
*/

import { Component, DomImpl, getDomImpl, h, setDomImpl } from "dreamland/core";
import { SSR, SSR_ID } from "../common/consts";

export let mountOne = (
	root: HTMLElement,
	component: Component<any, any, any>
): void => {
	let lookup = (ty: string, id: string) =>
		root.querySelector(`${ty}[${SSR_ID}='${id}'`);

	let old = getDomImpl();
	let vdom = [
		{
			createElement(ty: string, _, props: any) {
				let ssr = props[SSR];
				props[SSR] = false;
				if (ssr) return lookup(ty, ssr.id);
				else return document.createElement(ty);
			},
			createElementNS(ns: string, ty: string, props: any) {
				if (props[SSR]) return lookup(ty, props[SSR].id);
				else return document.createElementNS(ns, ty);
			},
			head: document.head,
		},
		old[1],
		old[2],
		old[3],
		old[4],
		(init, cx) => {
			if (init === component) {
				if (cx) {
					cx.root = root;
				} else if (init.style) {
					dev: {
						throw new Error("Hybrid SSR controllers do not support CSS");
					}
				}
			}
		},
	] satisfies DomImpl;
	setDomImpl(vdom);
	let x = h(component, {});
	setDomImpl(old);

	// @ts-expect-error prevent vite from messing stuff up
	return x;
};

export let mount = (
	roots: string | HTMLElement[],
	component: Component<any, any, any>
) => {
	(typeof roots == "string"
		? [...document.querySelectorAll<HTMLElement>(roots)]
		: roots
	).map((x) => mountOne(x, component));
};

export let discover = async (
	controllers: Record<string, () => Promise<any>>
) => {
	for (let controller in controllers) {
		let mod = await controllers[controller]();
		for (let key in mod) {
			let exp = mod[key];
			if (exp instanceof Function) {
				let name = exp.name.toLowerCase();
				mount(
					`[${SSR}-controller="${name.substring(0, name.length - 10)}"]`,
					exp
				);
			}
		}
	}
};
