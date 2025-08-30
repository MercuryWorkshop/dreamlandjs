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
import { SsrData, SsrObject } from "../common/types";

let SSR_ID_SYM = Symbol();

export let hydrate = (
	component: () => HTMLElement,
	ssr: HTMLElement,
	head: HTMLElement,
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

	let rootIdx = +ssr.getAttribute(SSR_ID);
	let idx = -1;
	let getInternal = (idx: number, push = true) => {
		let selector = `[${SSR_ID}="${idx}"]`;
		let ret = rootIdx == idx ? ssr : (ssr.querySelector(selector) || head.querySelector(selector));
		if (ret && push) {
			ret[SSR_ID_SYM] = idx;
			els.push(ret);
		}
		return ret;
	};
	let getRelative = () => {
		let [parent, offset] = data.n[++idx] as [number, number];
		return getInternal(parent, false).childNodes[offset];
	}

	let get = () => getInternal(++idx);

	let old = getDomImpl();
	let vdom = [
		{
			createElement: get,
			createElementNS: get,
			head: document.head,
		},
		old[1],
		getRelative,
		getRelative,
		() => {
			return data.i[idx + 1];
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
		let state = data.n[component[SSR_ID_SYM]];
		hydrateState(data, state as SsrObject, component.$.state);
	}

	return root;
};
