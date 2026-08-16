/*
// regular dl2 component syntax
// autoimported via the importmap stuff or manually mounted with `mount("selector or array of els", DropdownController)`
export function DropdownController(this: FC<{}, {
	hidden: boolean,
}>) {
	this.hidden = true;

	this.cx.mount = () => {
		// this.root points to the controller root
		console.log(this.root.outerHTML);
	}

	// return a bunch of mount points as a Fragment
	// mount points have dlssr to figure out where to mount them, id matches "dlssri=..."
	// any children/components or other props will just get added onto or modify the element
	return <>
		<button dlssr={{ id: "abc" }} on:click={() => this.hidden = false} />
		<div dlssr={{ id: "menu" }} class:hidden={use(this.hidden)}>
			<span>hydrated in content</span>
		</div>
	</>
}
*/

import {
	Component,
	DomImpl,
	domImpl,
	h,
	setDomImpl,
	Pointer,
} from "dreamland/core";
import { SSR, SSR_ID } from "../common/consts";

export let mountOne = (
	root: HTMLElement,
	component: Component<any, any>,
	data?: any
): void => {
	let lookup = (
		root: HTMLElement,
		ty: string,
		props: any,
		ssr: { id: string } | string
	) => {
		props[SSR] = undefined;
		if (typeof ssr === "string") ssr = { id: ssr };

		let el: HTMLElement | null | undefined;
		if (ty === SSR + "-root") el = root;
		else if (ssr.id)
			el = root.querySelector<HTMLElement>(`${ty}[${SSR_ID}='${ssr.id}'`);

		if (!el) return;

		for (let prop in props) {
			let val;
			if (prop.startsWith("attr:")) val = (el as any)[prop];
			else if (prop == "this" || prop.includes(":")) continue;
			else val = el.getAttribute(prop);
			if (val && props[prop] instanceof Pointer) {
				props[prop].value = val;
			}
		}

		return el;
	};

	let _old = domImpl,
		old = _old();
	let vdom = [
		{
			createElement(ty: string, _: any, props: any) {
				return (
					(props[SSR] && lookup(root, ty, props, props[SSR])) ||
					document.createElement(ty)
				);
			},
			createElementNS(ns: string, ty: string, props: any) {
				return (
					lookup(root, ty, props, props[SSR]) ||
					document.createElementNS(ns, ty)
				);
			},
			head: document.head,
		},
		old[1],
		old[2],
		old[3],
		old[4],
		old[5],
		(init, state, cx) => {
			if (init === component) {
				if (init.style) {
					dev: {
						throw new Error("Hybrid SSR controllers do not support CSS");
					}
				}

				if (cx) {
					cx.state.root = root;
				} else {
					(state as any).ssrData = data;
				}
			}
		},
	] satisfies DomImpl;
	setDomImpl(() => vdom);
	let x = h(component, {});
	setDomImpl(_old);

	// @ts-expect-error prevent vite from messing stuff up
	return x;
};

export let mount = (
	roots: string | HTMLElement[],
	component: Component<any, any>,
	getData?: (x: HTMLElement) => any
) => {
	(typeof roots == "string"
		? [...document.querySelectorAll<HTMLElement>(roots)]
		: roots
	).map((x) => mountOne(x, component, getData?.(x)));
};

export let discover = async (
	controllers: Record<string, () => Promise<any>>
) => {
	for (let controller in controllers) {
		let mod = await controllers[controller]();
		for (let key in mod) {
			let exp = mod[key];
			if (exp instanceof Function) {
				mount(
					`[${SSR}-controller="${exp.name.toLowerCase().slice(0, -10)}"]`,
					exp
				);
			}
		}
	}
};
