import { Element as DomElement, Text as DomText } from "domhandler";
import { getDomImpl, jsx, NO_CHANGE, setDomImpl } from "dreamland/core";
import { Comment, Element, newVDom } from "./vdom";

import { SSR, SSR_DATA } from "../common/consts";
import { SsrData } from "../common/types";
import { serializeState } from "../common/serialize";

export interface RenderedComponent {
	head: DomElement[];
	data: DomElement;
	component: DomElement;
}

export function render(component: () => any): RenderedComponent {
	let old = getDomImpl();
	let vdom = newVDom(old);

	setDomImpl(vdom);
	jsx[NO_CHANGE]();
	let root = component() as Element;
	setDomImpl(old);

	let data: SsrData = {
		k: [],
		v: [],
		s: {},
		i: vdom[0].identArr,
	};

	for (let [i, dom] of vdom[0].elArr.map((x, i) => [i, x] as const)) {
		if (dom instanceof Element) {
			if (dom.component) {
				data.s[i] = serializeState(data, dom.component.state, (x) => x instanceof vdom[1]);
			}
		}
		if (dom instanceof Comment) {
			dom.data = `${i} ${SSR} ${dom.data}`;
		}
	}

	let head = vdom[0].head.childNodes.map((x) => x.toStandard()) as DomElement[];

	return {
		head,
		data: new DomElement(
			"script",
			{ type: "application/json", [SSR_DATA]: ":3" },
			[new DomText(JSON.stringify(data))]
		),
		component: root.toStandard(),
	};
}
