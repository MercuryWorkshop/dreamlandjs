import {
	DomImpl,
	DREAMLAND,
	getDomImpl,
	jsx,
	setDomImpl,
} from "dreamland/core";
import { DL_SSR_CSS_ID, DL_SSR_ID, DL_SSR_STATE_ATTR } from "../common/consts";

export let hydrate = (
	ssr: HTMLElement,
	dataRoot: HTMLElement,
	component: () => HTMLElement
) => {
	dev: {
		if (dataRoot.getAttribute(DL_SSR_STATE_ATTR) !== ":3")
			throw "invalid ssr root";
	}

	let rootIdx = +ssr.getAttribute(DL_SSR_ID);
	let idx = -1;
	let getInternal = (idx) => {
		let ret =
			rootIdx == idx ? ssr : ssr.querySelector(`[${DL_SSR_ID}="${idx}"]`);
		console.log(idx, ret);
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
			return new Comment(comment);
		},
		(name) => {
			let ret = getInternal(idx + 1).getAttribute(DL_SSR_CSS_ID);
			console.log(ret);
			return ret;
		},
	] as const satisfies DomImpl;

	let old = getDomImpl();
	setDomImpl(vdom);
	jsx[DREAMLAND](true);
	let root = component();
	jsx[DREAMLAND](false);
	setDomImpl(old);

	console.log(ssr, dataRoot, root);
};
