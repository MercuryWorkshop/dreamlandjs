import { DREAMLAND, VNODE } from "../consts";
import { createState, DLBasePointer, isBasePtr } from "../state";

export type VNode = {
	[DREAMLAND]: typeof VNODE,
	// @internal
	_init: string | Function,
	// @internal
	_children: (VNode | string | DLBasePointer<any>)[],
	// @internal
	_props: Record<string, any>,

	// @internal
	_rendered?: HTMLElement,
};

function isVNode(val: any): val is VNode {
	return val[DREAMLAND] === VNODE;
}

type ComponentChild = VNode | string | number | boolean | null | undefined | DLBasePointer<ComponentChild>;

function mapChild(child: ComponentChild): Node {
	if (child == null) {
		return document.createComment("");
	} else if (isBasePtr(child)) {
		let childEl: Node = null!;

		function setNode(val: ComponentChild) {
			let newEl: Node = mapChild(val);
			childEl?.parentNode.replaceChild(newEl, childEl);
			childEl = newEl;
		}

		setNode(child.value);
		child.listen(setNode);
		return childEl;
	} else if (isVNode(child)) {
		return render(child);
	} else {
		return document.createTextNode("" + child);
	}
}

export function render(node: VNode): HTMLElement {
	dev: {
		if (!isVNode(node)) {
			throw "render requires a vnode";
		}
	}

	if (node._rendered) return node._rendered;

	if (typeof node._init === "function") {
		let state = createState({
			...node._props,
			children: node._children,
		});
		let tree = node._init.call(state);

		return render(tree);
	} else {
		let el = document.createElement(node._init);
		node._rendered = el;

		for (let attr in node._props) {
			let val = node._props[attr];
			if (attr.startsWith("on:")) {
				el.addEventListener(attr.substring(3), val);
			} else {
				el.setAttribute(attr, val);
			}
		}

		for (let child of node._children) {
			el.appendChild(mapChild(child));
		}

		return el;
	}
}
