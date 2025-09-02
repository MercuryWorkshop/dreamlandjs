import { Element as DomElement, Text as DomText } from "domhandler";
import { getDomImpl, jsx, NO_CHANGE, setDomImpl } from "dreamland/core";
import { Comment, Text, Element, newVDom } from "./vdom";

import { SSR_DATA } from "../common/consts";
import { Node, SsrData } from "../common/types";
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
		n: {},
		i: vdom[0].identArr,
	};

	for (let [i, el] of vdom[0].elArr.map((x, i) => [i, x] as const)) {
		let node: Node;
		if (el instanceof Element && el.component) {
			node = serializeState(
				data,
				el.component.state,
				(x) => x instanceof vdom[1]
			);
		}
		if (el instanceof Comment || el instanceof Text) {
			node = [
				el.parent._id,
				el.parent.childNodes.findIndex((x) => x._id === el._id),
			];
		}
		data.n[i] = node;
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
