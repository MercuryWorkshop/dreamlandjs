import { DREAMLAND_INTERNAL } from "../consts";
import { $state, DLBasePointer } from "../state";

export type VNode = {
	[DREAMLAND_INTERNAL]: true,
	_init: string | Function,
	_children: (VNode | string | DLBasePointer<any>)[],
	_props: Record<string, any>,

	_rendered?: HTMLElement,
};

export function render(node: VNode): HTMLElement {
	if (node._rendered) return node._rendered;

	const processChildren = (el: HTMLElement) => {
		for (let child of node._children) {
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

	if (typeof node._init === "function") {
		let state = $state({
			...node._props,
			children: node._children,
		});
		let tree = node._init.call(state);

		return render(tree);
	} else {
		const el = document.createElement(node._init);
		node._rendered = el;

		for (let attr in node._props) {
			const val = node._props[attr];
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
