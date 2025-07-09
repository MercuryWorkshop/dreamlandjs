import { Element as DomElement, Text as DomText } from "domhandler";
import { getDomImpl, setDomImpl } from "dreamland/core";
import { Comment, Element, newVDom } from "./vdom";

import { serializeState } from "../common/serialize";
import {
	SSR,
	SSR_COMPONENT_STATE,
	SSR_ID,
	SSR_STATE_ATTR,
} from "../common/consts";

export interface RenderedComponent {
	head: DomElement[];
	component: DomElement;
}

function ssrData(key: string, value: string, data: string) {
	return new DomElement(
		"script",
		{
			type: "application/json",
			[key]: value,
		},
		[new DomText(data)]
	);
}

export function render(component: () => any): RenderedComponent {
	let old = getDomImpl();
	let vdom = newVDom(old);

	setDomImpl(vdom);
	let root = component() as Element;
	setDomImpl(old);

	let componentState: DomElement[] = [];

	for (let [i, dom] of vdom[0].arr.map((x, i) => [i, x] as const)) {
		if (dom instanceof Element) {
			if (dom.component) {
				let state = serializeState(dom.component.state);
				if (state.length > 2) {
					componentState.push(
						ssrData(SSR_COMPONENT_STATE, dom.component.id, state)
					);
				}
			}
			dom.setAttribute(SSR_ID, "" + i);
		}
		if (dom instanceof Comment) {
			dom.data = `${i} ${SSR} ${dom.data}`;
		}
	}

	let head = vdom[0].head.childNodes.map((x) => x.toStandard()) as DomElement[];

	head.push(
		new DomElement("div", { [SSR_STATE_ATTR]: ":3", style: "display:none;" }, [
			...componentState,
		])
	);

	console.log(vdom[0].arr);

	return {
		head,
		component: root.toStandard(),
	};
}
