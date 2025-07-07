import { Element as DomElement, Text as DomText } from "domhandler";
import { getDomImpl, setDomImpl } from "dreamland/core";
import { Element, newVDom } from "./vdom";

import { serializeState } from "../common/serialize";
import { DL_COMPONENT_STATE_ATTR } from "../common/consts";

export interface RenderedComponent {
	head: DomElement[];
	component: DomElement;
}

function buildSsrData(type: string, data: string): DomElement {
	return new DomElement("script", { type: "text/plain", [type]: null }, [
		new DomText(data),
	]);
}

export function render(component: () => any): RenderedComponent {
	let vdom = newVDom();

	let old = getDomImpl();
	setDomImpl(vdom);
	let root = component();
	setDomImpl(old);

	let componentState: string[] = [];

	function walkRendered(dom: Element) {
		if (dom.component) {
			let state = serializeState(dom.component.state);
			if (state.length > 2) {
				componentState.push(dom.component.id + state);
			}
		}

		dom.childNodes.forEach(walkRendered);
	}

	walkRendered(root);

	let head = vdom[0].head.childNodes.map((x) => x.toStandard()) as DomElement[];

	head.push(buildSsrData(DL_COMPONENT_STATE_ATTR, componentState.join("\n")));

	return {
		head,
		component: root.toStandard(),
	};
}
