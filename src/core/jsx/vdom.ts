import { DREAMLAND, VNODE } from "../consts";
import {
	createState,
	DLBasePointer,
	isBasePtr,
	Stateful,
	stateProxy,
} from "../state";
import { cssBoundary, cssComponent, DLCSS, rewriteCSS } from "./css";

export type VNode = {
	[DREAMLAND]: typeof VNODE;
	// @internal
	_init: string | Component;
	// @internal
	_children: (VNode | string | DLBasePointer<any>)[];
	// @internal
	_props: Record<string, any>;

	// @internal
	_rendered?: HTMLElement;
};

function genuid() {
	// prettier-ignore
	// dl 0.0.x:
	//     `${Array(4).fill(0).map(()=>Math.floor(Math.random()*36).toString(36)}).join('')}`
	return [...Array(16)].reduce(a => a + Math.random().toString(36)[2], '')
	// the above will occasionally misfire with `undefined` or 0 in the string whenever Math.random returns exactly 0 or really small numbers
	// we don't care, it would be very uncommon for that to actually happen 16 times
}

function isVNode(val: any): val is VNode {
	return val[DREAMLAND] === VNODE;
}

export type ComponentChild =
	| VNode
	| string
	| number
	| boolean
	| null
	| undefined
	| DLBasePointer<ComponentChild>;

function mapChild(child: ComponentChild, tag?: string): Node {
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
		return renderInternal(child, tag);
	} else {
		return document.createTextNode("" + child);
	}
}

export type ComponentContext = {
	root: HTMLElement;

	css?: DLCSS;

	mount?: () => void;
};

type ProxiedProps<Props> = {
	[Key in keyof Props]: Props[Key] extends DLBasePointer<infer Pointed>
		? Pointed
		: Props[Key];
};
export type Component<Props = {}, Private = {}, Public = {}> = (
	this: Stateful<ProxiedProps<Props> & Private & Public>,
	cx: ComponentContext
) => VNode;

function renderInternal(node: VNode, tag?: string): HTMLElement {
	dev: {
		if (!isVNode(node)) {
			throw "render requires a vnode";
		}
	}

	if (node._rendered) return node._rendered;

	let el: HTMLElement;

	if (typeof node._init === "function") {
		let state = createState({});
		for (let attr in node._props) {
			let val = node._props[attr];

			if (isBasePtr(val)) {
				stateProxy(state, attr, val);
			} else {
				state[attr] = val;
			}
		}

		let cx = {} as ComponentContext;
		let html = node._init.call(state, cx);

		let cssIdent = "dl-" + node._init.name + "-" + genuid();
		el = renderInternal(html, cssIdent);
		node._rendered = el;

		el.classList.add(cssComponent);
		if (!cx.css?._cascade) el.classList.add(cssBoundary);
		if (cx.css) {
			let el = document.createElement("style");
			el.innerText = rewriteCSS(cx.css, cssIdent);
			document.head.append(el);
		}

		cx.root = el;
		cx.mount?.();
	} else {
		el = document.createElement(node._init);
		node._rendered = el;

		for (let attr in node._props) {
			let val = node._props[attr];
			if (attr.startsWith("on:")) {
				el.addEventListener(attr.substring(3), val);
			} else if (attr.startsWith("class:")) {
				let name = attr.substring(6);
				let handle = (val: boolean) => {
					if (val) {
						el.classList.add(name);
					} else {
						el.classList.remove(name);
					}
				};
				if (isBasePtr(val)) {
					val.listen(handle);
					handle(val.value);
				} else {
					handle(val);
				}
			} else {
				el.setAttribute(attr, val);
			}
		}

		if (tag) el.classList.add(tag);

		for (let child of node._children) {
			el.appendChild(mapChild(child, tag));
		}
	}

	return el;
}

// sadly they don't optimize this out
export let render: (node: VNode) => HTMLElement = renderInternal;

/* not finalized yet, maybe later though
 * putting this code up next to the function component broke the build somehow
export class Component {
	html: VNode;

	root: HTMLElement;
	children: ComponentChild[];

	css?: DLCSS;

	// @internal
	_cssIdent: string;

	mount() {}
	constructor() {
		this._cssIdent = "dl-" + this.constructor.name + "-" + genuid();
		return createState(this);
	}
}
*/
