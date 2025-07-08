import {
	DLElement,
	DomImpl,
	DREAMLAND,
	getDomImpl,
	jsx,
	setDomImpl,
} from "dreamland/core";
import {
	DL_SSR_COMPONENT_STATE,
	DL_SSR_CSS_ID,
	DL_SSR_ID,
	DL_SSR_STATE_ATTR,
} from "../common/consts";
import { hydrateState } from "../common/serialize";

export let hydrate = (
	component: () => HTMLElement,
	ssr: HTMLElement,
	dataRoot: HTMLElement
) => {
	dev: {
		if (dataRoot.getAttribute(DL_SSR_STATE_ATTR) !== ":3")
			throw "invalid ssr root";
	}

	let els = [];
	let commentArr = [];

	let walk = (node: Node) => {
		if (node instanceof Comment) {
			let data = node.data.split(" ");
			commentArr.push([+data[0], node]);
		}
		node.childNodes.forEach(walk);
	};
	walk(ssr);
	let comments = new Map(commentArr);

	let rootIdx = +ssr.getAttribute(DL_SSR_ID);
	let idx = -1;
	let getInternal = (idx) => {
		let ret =
			rootIdx == idx ? ssr : ssr.querySelector(`[${DL_SSR_ID}="${idx}"]`);
		if (ret) els.push(ret);
		return ret;
	};

	let get = () => {
		idx++;
		return getInternal(idx);
	};

	let vdom = [
		{
			createElement: get,
			createElementNS: get,
			head: document.head,
		},
		Node,
		(text) => {
			idx++;
			return new Text(text);
		},
		(comment) => {
			idx++;
			return comments.get(idx);
		},
		(name) => {
			let ret = getInternal(idx + 1).getAttribute(DL_SSR_CSS_ID);
			return ret;
		},
	] as const satisfies DomImpl;

	let old = getDomImpl();
	setDomImpl(vdom);
	jsx[DREAMLAND](true);
	let root = component();
	jsx[DREAMLAND](false);
	setDomImpl(old);

	let ssrData = [...dataRoot.children];

	let componentState = new Map(
		ssrData.flatMap((x) => {
			let component = x.getAttribute(DL_SSR_COMPONENT_STATE);
			return component ? [[component, JSON.parse(x.innerHTML)]] : [];
		})
	);

	for (let component of els.filter((x) => x.$) as DLElement<any>[]) {
		let state = componentState.get(component.$.id);
		hydrateState(state || {}, component.$.state);
	}

	return root;
};
