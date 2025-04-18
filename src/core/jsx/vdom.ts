import { DREAMLAND_INTERNAL } from "../consts";
import { $state, DLBasePointer } from "../state";

export type VNode = {
	[DREAMLAND_INTERNAL]: true,
	init: string | Function,
	children: (VNode | string | DLBasePointer<any>)[],
	props: Record<string, any>,

	rendered?: HTMLElement,
};

export function render(node: VNode): HTMLElement {
	if (node.rendered) return node.rendered;

	const processChildren = (el: HTMLElement) => {
		for (let child of node.children) {
			if (child instanceof DLBasePointer) {
				let childEl: Node = document.createTextNode("");
				el.appendChild(childEl);

				function setNode(val: any) {
					let newEl: Node;
					if (val instanceof Node) {
						newEl = val;
					} else if (val[DREAMLAND_INTERNAL]) {
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
			} else if (child != null) {
				el.appendChild(render(child));
			}
		}
	};

	if (typeof node.init === "function") {
		let state = $state({
			...node.props,
			children: node.children,
		});
		let tree = node.init.call(state);

		return render(tree);
	} else {
		const el = document.createElement(node.init);
		node.rendered = el;

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
