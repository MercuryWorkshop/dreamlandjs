import { DOCUMENT } from "../consts";
import { createState, isBasePtr, isBoundPtr, stateProxy } from "../state";
import { cssBoundary, cssComponent, genuid, rewriteCSS } from "./css";
import { ComponentChild, ComponentContext, DLElement } from "./dom";
// jsx definitions
import "./jsx";

import htm from "htm/mini";

export {
	DLElement,
	Component,
	ComponentChild,
	ComponentContext,
	ComponentInstance,
} from "./dom";
export { scope, cascade, DLCSS } from "./css";

let currentCssIdent: string | null = null;

function withIdent<T>(ident: string, fn: () => T): T {
	let old = currentCssIdent;
	currentCssIdent = ident;
	let x = fn();
	currentCssIdent = old;
	return x;
}

function comment(text: string) {
	return DOCUMENT.createComment(text);
}

function mapChild(child: ComponentChild, el: Node, before?: Node): Node {
	if (child == null) {
		return comment("");
	} else if (isBasePtr(child)) {
		let childEl: Node = null!;

		function setNode(val: ComponentChild) {
			let newEl: Node = mapChild(val, el, childEl);
			if (childEl) el.replaceChild(newEl, childEl);
			childEl = newEl;
		}

		setNode(child.value);
		child.listen(setNode);
		return childEl;
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
			let mapped = mapChild(x, el);
			el.insertBefore(mapped, anchor);
			anchor = mapped;
		}

		return end;
	} else {
		return DOCUMENT.createTextNode("" + child);
	}
}

function jsxFactory(
	init: any,
	props: Record<string, any> | null,
	...children: ComponentChild[]
): HTMLElement {
	dev: {
		if (!["string", "function"].includes(typeof init))
			throw "invalid component";
	}

	let el: HTMLElement;

	if (typeof init === "function") {
		let state = createState({ children });
		for (let attr in props) {
			let val = props[attr];

			if (isBasePtr(val)) {
				stateProxy(state, attr, val);
			} else {
				state[attr] = val;
			}
		}

		let cx = { state } as ComponentContext<any>;
		let cssIdent = "dl-" + init.name + "-" + genuid();

		el = withIdent(cssIdent, () => init.call(state, cx));

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
		let xmlns = props?.xmlns;
		el = xmlns
			? DOCUMENT.createElementNS(xmlns, init)
			: DOCUMENT.createElement(init);

		for (let attr in props) {
			let val = props[attr];
			if (attr === "this") {
				dev: {
					if (!isBoundPtr(val)) {
						throw "this prop value must be a bound pointer";
					}
				}
				val.value = el;
			} else if (attr.startsWith("on:")) {
				let ident = currentCssIdent;
				el.addEventListener(attr.substring(3), (e) =>
					withIdent(ident, () => val(e))
				);
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

		if (currentCssIdent) el.classList.add(currentCssIdent);

		for (let child of children) {
			el.appendChild(mapChild(child, el));
		}

		if (xmlns) el.innerHTML = el.innerHTML;
	}

	return el;
}

export let html = htm.bind(jsxFactory);

export { jsxFactory as h };
