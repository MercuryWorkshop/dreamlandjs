import {
	DLElement,
	DomImpl,
	DREAMLAND,
	getDomImpl,
	jsx,
	NO_CHANGE,
	setDomImpl,
} from "dreamland/core";
import { SSR_DATA, SSR_ID } from "../common/consts";
import { hydrateState } from "../common/serialize";
import { SsrData } from "../common/types";

let SSR_ID_SYM = Symbol();

export let hydrate = (
	component: () => HTMLElement,
	ssr: HTMLElement,
	dataEl: HTMLElement
) => {
	dev: {
		if (dataEl.getAttribute(SSR_DATA) !== ":3") throw "invalid ssr root";
	}
	let dataText = dataEl.innerText;

	// decode entities
	let textarea = jsx("textarea", {}) as HTMLTextAreaElement;
	textarea.innerHTML = dataText;

	let data: SsrData = JSON.parse(textarea.value);

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
		if (ret) {
			ret[SSR_ID_SYM] = idx;
			els.push(ret);
		}
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
		() => {
			return data.i[idx];
		},
		old[5],
	] as const satisfies DomImpl;
	setDomImpl(vdom);
	jsx[NO_CHANGE]();
	jsx[DREAMLAND](true);
	let root = component();
	jsx[DREAMLAND](false);
	setDomImpl(old);

	for (let component of els.filter((x) => x.$) as DLElement<any>[]) {
		let state = data.s[component[SSR_ID_SYM]];
		hydrateState(data, state, component.$.state);
	}

	return root;
};
