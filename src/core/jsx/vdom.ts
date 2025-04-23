import { DOCUMENT, DREAMLAND, VNODE } from "../consts";
import {
	createState,
	DLBasePointer,
	isBasePtr,
	isBoundPtr,
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
	| Node
	| string
	| number
	| boolean
	| null
	| undefined
	| ComponentChild[]
	| DLBasePointer<ComponentChild>;

function comment(text: string) {
	return DOCUMENT.createComment(text);
}

function mapChild(
	child: ComponentChild,
	el: Node,
	before: Node | null,
	tag?: string
): Node {
	if (child == null) {
		return comment("");
	} else if (isBasePtr(child)) {
		let childEl: Node = null!;

		function setNode(val: ComponentChild) {
			let newEl: Node = mapChild(val, el, childEl, tag);
			if (childEl) el.replaceChild(newEl, childEl);
			childEl = newEl;
		}

		setNode(child.value);
		child.listen(setNode);
		return childEl;
	} else if (isVNode(child)) {
		return renderInternal(child, tag);
	} else if (child instanceof Node) {
		return child;
	} else if (child instanceof Array) {
		// TODO make this smarter
		let uid: string, start: Comment, end: Comment;
		let children = Array.from(el.childNodes);
		if (!before) {
			uid = "dlarr-" + genuid();
			start = comment(uid);
			end = comment(uid);
			el.appendChild(start);
			el.appendChild(end);
		} else {
			uid = (before as Comment).data;
			end = before as Comment;
			for (let child of children) {
				// comment node
				if (child.nodeType === 8 && (child as Comment).data === uid) {
					start = child as Comment;
					break;
				}
			}
		}
		if (!end) throw "vdom error";

		let started = false;
		let current: Node[] = [];
		for (let child of children) {
			if (child === start) {
				started = true;
			} else if (child === end) {
				break;
			} else if (started) {
				current.push(child);
			}
		}
		for (let x of current) el.removeChild(x);

		let anchor: Node = end;
		for (let x of [...child].reverse()) {
			let mapped = mapChild(x, el, null, tag);
			el.insertBefore(mapped, anchor);
			anchor = mapped;
		}

		return end;
	} else {
		return DOCUMENT.createTextNode("" + child);
	}
}

export type ComponentContext<T> = {
	state: Stateful<T>;

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
	cx: ComponentContext<ProxiedProps<Props> & Private & Public>
) => VNode;
export type ComponentInstance<T extends Component> =
	T extends Component<infer Props, infer Private, infer Public>
		? DLElement<ProxiedProps<Props> & Private & Public>
		: never;
export type DLElement<T> = HTMLElement & { $: ComponentContext<T> };

function renderInternal(
	node: VNode,
	tag?: string
): DLElement<any> | HTMLElement {
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

		let cx = { state } as ComponentContext<any>;
		let html = node._init.call(state, cx);

		let cssIdent = "dl-" + node._init.name + "-" + genuid();
		el = renderInternal(html, cssIdent);
		node._rendered = el;
		(el as DLElement<any>).$ = cx;

		el.classList.add(cssComponent);
		if (!cx.css?._cascade) el.classList.add(cssBoundary);
		if (cx.css) {
			let el = DOCUMENT.createElement("style");
			el.innerText = rewriteCSS(cx.css, cssIdent);
			DOCUMENT.head.append(el);
		}

		cx.root = el;
		cx.mount?.();
	} else {
		let xmlns = node._props?.xmlns;
		el = xmlns
			? DOCUMENT.createElementNS(xmlns, node._init)
			: DOCUMENT.createElement(node._init);
		node._rendered = el;

		for (let attr in node._props) {
			let val = node._props[attr];
			if (attr === "this") {
				dev: {
					if (!isBoundPtr(val)) {
						throw "this prop value must be a bound pointer";
					}
				}
				val.value = el;
			} else if (attr.startsWith("on:")) {
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
			} else if (isBasePtr(val)) {
				val.listen((val) => el.setAttribute(attr, val));
				el.setAttribute(attr, val.value);
			} else {
				el.setAttribute(attr, val);
			}
		}

		if (tag) el.classList.add(tag);

		for (let child of node._children) {
			el.appendChild(mapChild(child, el, null, tag));
		}

		if (xmlns) el.innerHTML = el.innerHTML;
	}

	return el;
}

// sadly they don't optimize this out
export let render: (node: VNode) => DLElement<any> | HTMLElement =
	renderInternal;

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
