import { DREAMLAND_INTERNAL } from "../consts";
import { DLBasePointer } from "../state";

export type VdomNode = {
	[DREAMLAND_INTERNAL]: true,
	init: string | Function,
	children: (VdomNode | string | DLBasePointer<any>)[],
	props: Record<string, any>,
};

export function render(node: VdomNode): HTMLElement {
	const processChildren = (el: HTMLElement) => {
		for (let child of node.children) {
			if (child instanceof DLBasePointer) {
				let childEl: Node = document.createTextNode("");
				el.appendChild(childEl);

				function setNode(val: any) {
					let newEl: Node;
					if (child[DREAMLAND_INTERNAL]) {
						newEl = render(val);
					} else {
						newEl = document.createTextNode(val);
					}
					el.replaceChild(newEl, childEl);
					childEl = newEl;
				}

				setNode(child.value);
				child.listen((x: any) => setNode(x));
			} else if (typeof child === "string") {
				el.appendChild(document.createTextNode(child));
			} else {
				el.appendChild(render(child));
			}
		}
	};

	if (typeof node.init === "function") {
		throw "todo";
	} else {
		const el = document.createElement(node.init);

		for (let attr in node.props) {
			const val = node.props[attr];
			if (attr.startsWith("on:")) {
				el.addEventListener(attr.substring(3), val);
			} else {
				el.setAttribute(attr, val);
			}
		}

		processChildren(el);

		return el;
	}
}
