import { Element } from "domhandler";
import { getDomImpl, setDomImpl } from "dreamland/core";
import { newVDom } from "./vdom";

export interface RenderedComponent {
	head: Element[];
	component: Element;
}

export function render(component: () => any): RenderedComponent {
	let vdom = newVDom();

	let old = getDomImpl();
	setDomImpl(vdom);
	let root = component();
	setDomImpl(old);

	(globalThis as any).console.log(root, vdom[0].head);

	let head = vdom[0].head.childNodes.map((x) => x.toStandard()) as Element[];

	return {
		head,
		component: root.toStandard(),
	};
}
