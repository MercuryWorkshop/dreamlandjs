import { Element as DomElement, Text as DomText } from "domhandler";
import { getDomImpl, setDomImpl } from "dreamland/core";
import { Element, newVDom } from "./vdom";

import { serializeState } from "../common/serialize";
import {
	DL_COMPONENT_STATE_ATTR,
	DL_SSR_CSS_ID,
	DL_SSR_ID,
	DL_SSR_STATE_ATTR,
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
						ssrData(DL_COMPONENT_STATE_ATTR, dom.component.id, state)
					);
				}
			}
			dom.setAttribute(DL_SSR_ID, "" + i);
		}
	}

	function propagate(dom: Element, css?: string) {
		if (css) dom.setAttribute(DL_SSR_CSS_ID, css);

		for (let child of dom.childNodes) {
			if (child instanceof Element) propagate(child, dom.component?.id || css);
		}
	}
	propagate(root, root.component?.id);

	console.log(vdom[0].arr);

	let head = vdom[0].head.childNodes.map((x) => x.toStandard()) as DomElement[];

	head.push(
		new DomElement(
			"div",
			{ [DL_SSR_STATE_ATTR]: ":3", style: "display:none;" },
			[...componentState]
		)
	);

	return {
		head,
		component: root.toStandard(),
	};
}
