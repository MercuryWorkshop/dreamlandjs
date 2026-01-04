import {
	ComponentContext,
	DomImpl,
	DREAMLAND,
	getDomImpl,
	jsx,
	NO_CHANGE,
	setDomImpl,
} from "dreamland/core";
import { SSR_DATA, SSR_ID } from "../common/consts";
import { hydrateState, Json } from "../common/serialize";
import { SsrData, SsrObject } from "../common/types";

export let hydrate = (
	component: () => HTMLElement,
	ssr: HTMLElement,
	head: HTMLElement,
	dataEl: HTMLElement
) => {
	dev: {
		if (dataEl.getAttribute(SSR_DATA) !== ":3") throw "invalid ssr root";
	}
	// decode entities
	let textarea = jsx("textarea", {}) as HTMLTextAreaElement;
	textarea.innerHTML = dataEl.innerText;
	let data: SsrData = Json.parse(textarea.value);

	let els: [number, HTMLElement][] = [];

	let rootIdx = +ssr.getAttribute(SSR_ID)!;
	let idx = -1;
	let getInternal = (idx: number) => {
		let selector = `[${SSR_ID}="${idx}"]`;
		let ret =
			rootIdx == idx
				? ssr
				: ssr.querySelector<HTMLElement>(selector) ||
					head.querySelector<HTMLElement>(selector);
		if (ret) els.push([idx, ret]);
		return ret;
	};
	let getRelative = () => {
		let info = data.n[++idx];
		if (!info) return;

		let [parent, offset] = info as [number, number];
		return getInternal(parent)?.childNodes?.[offset];
	};
	let hydrateCx = (cx: ComponentContext<any>) => {
		let ssr = data.n[cx?.root?.getAttribute?.(SSR_ID) as any as number];
		if (ssr) {
			hydrateState(data, ssr as SsrObject, cx.state);
		}
	};
	let hydrating = (x: HTMLElement) => x.hasAttribute(SSR_ID);

	for (let [parent, offset, len] of data.t) {
		let text = getInternal(parent)!.childNodes[offset] as Text;
		if (text.length !== len) text.splitText(len);
	}

	let old = getDomImpl();
	let vdom = [
		{
			createElement: (x: any) => getInternal(++idx) || old[0].createElement(x),
			createElementNS: (x: any, y: any) =>
				getInternal(++idx) || old[0].createElementNS(x, y),
			head: old[0].head,
		},
		old[1],
		(x) => getRelative() || old[2](x),
		(x) => getRelative() || old[3](x),
		() => data.i[idx + 1] || old[4](),
		hydrating,
		(init, cx) => {
			if (cx?.root instanceof old[1] && !hydrating(cx.root)) hydrateCx(cx);
		},
	] as const satisfies DomImpl;
	setDomImpl(vdom);
	jsx[DREAMLAND]();
	let root = component();
	setDomImpl(old);

	jsx[NO_CHANGE]().map((x) => {
		hydrateCx(x);
		x.mount?.();
	});

	return root;
};
