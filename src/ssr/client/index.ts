import {
	DLElement,
	DomImpl,
	DREAMLAND,
	getDomImpl,
	jsx,
	setDomImpl,
} from "dreamland/core";
import { SSR_COMPONENT_STATE, SSR_ID, SSR_STATE_ATTR } from "../common/consts";
import { hydrateState } from "../common/serialize";

export let hydrate = (
	component: () => HTMLElement,
	ssr: HTMLElement,
	dataRoot: HTMLElement
) => {
	dev: {
		if (dataRoot.getAttribute(SSR_STATE_ATTR) !== ":3")
			throw "invalid ssr root";
	}

	let els = [];
	let commentArr = [];

	let walk = (node: Node) => {
		if (node.nodeType == 8) {
			commentArr.push([+(node as Comment).data.split(" ")[0], node as Comment]);
		}
		node.childNodes.forEach(walk);
	};
	walk(ssr);
	let comments = new Map(commentArr);

	let rootIdx = +ssr.getAttribute(SSR_ID);
	let idx = -1;
	let getInternal = (idx: number) => {
		let ret = rootIdx == idx ? ssr : ssr.querySelector(`[${SSR_ID}="${idx}"]`);
		if (ret) els.push(ret);
		return ret;
	};

	let get = () => getInternal(++idx);

	let old = getDomImpl();
	let vdom = [
		{
			createElement: get,
			createElementNS: get,
			head: document.head,
		},
		old[1],
		(text) => {
			idx++;
			return new Text(text);
		},
		(comment) => {
			return comments.get(++idx);
		},
		() =>
			[...getInternal(idx + 1).classList].find((x) => x.startsWith("dlcss-")),
		old[5],
	] as const satisfies DomImpl;
	setDomImpl(vdom);
	jsx[DREAMLAND](true);
	let root = component();
	jsx[DREAMLAND](false);
	setDomImpl(old);

	let componentState = new Map(
		[...dataRoot.children].flatMap((x) => {
			let component = x.getAttribute(SSR_COMPONENT_STATE);
			return component ? [[component, JSON.parse(x.innerHTML)]] : [];
		})
	);

	for (let component of els.filter((x) => x.$) as DLElement<any>[]) {
		let state = componentState.get(component.$.id);
		hydrateState(state || {}, component.$.state);
	}

	return root;
};
