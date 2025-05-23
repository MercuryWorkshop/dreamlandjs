import { DOCUMENT } from "../consts";
import { createState, isBasePtr, isBoundPtr, stateProxy } from "../state";
import { cssBoundary, cssComponent, genuid, rewriteCSS } from "../css";
import {
	Component,
	ComponentChild,
	ComponentContext,
	ComponentInstance,
	DLElement,
	DLElementNameToElement,
} from "./definitions";
import { fatal } from "../utils";

export {
	DLElement,
	Component,
	ComponentChild,
	ComponentContext,
	ComponentInstance,
	DLElementNameToElement,
} from "./definitions";

let currentCssIdent: string | null = null;

let withIdent = <T>(ident: string, fn: () => T): T => {
	let old = currentCssIdent;
	currentCssIdent = ident;
	let x = fn();
	currentCssIdent = old;
	return x;
};

let comment = (text?: string) => {
	return new Comment(text);
};

let mapChild = (child: ComponentChild, el: Node, before?: Node): Node => {
	if (child == null) {
		return comment();
	} else if (isBasePtr(child)) {
		let childEl: Node = null!;

		let setNode = (val: ComponentChild) => {
			let newEl: Node = mapChild(val, el, childEl);
			if (childEl) el.replaceChild(newEl, childEl);
			childEl = newEl;
		};

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
		if (!end) fatal();

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
		return new Text(child as any);
	}
};

function jsxFactory<T extends Component<any, any, any>>(
	init: T,
	props: Record<string, any> | null,
	...children: ComponentChild[]
): ComponentInstance<T>;
function jsxFactory<T extends string>(
	init: T,
	props: Record<string, any> | null,
	...children: ComponentChild[]
): DLElementNameToElement<T>;
function jsxFactory(
	init: Component<any, any, any> | string,
	props: Record<string, any> | null,
	...children: ComponentChild[]
): HTMLElement {
	dev: {
		if (!["string", "function"].includes(typeof init))
			throw new Error("invalid component");
	}

	let el: HTMLElement;

	if (typeof init === "function") {
		let state = createState({});
		for (let attr in props) {
			let val = props[attr];

			if (isBasePtr(val)) {
				stateProxy(state, attr, val);
			} else {
				state[attr] = val;
			}
		}

		let cx = Object.create(init.prototype) as ComponentContext<any>;
		cx.state = state;
		cx.children = children;

		let cssIdent = "dl-" + genuid();

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
		el = DOCUMENT["createElement" + (xmlns ? "NS" : "")](xmlns || init, init);

		let currySetVal = (param: string) => (val: any) => {
			el.setAttribute(param, val);
			(el as any).value = val;
		};

		for (let attr in props) {
			let val = props[attr];
			if (attr === "this") {
				dev: {
					if (!isBoundPtr(val)) {
						throw new Error("this prop value must be a bound pointer");
					}
				}
				val.value = el;
			} else if (attr === "value") {
				let set = currySetVal("value");
				if (isBasePtr(val)) {
					val.listen(set);
					if (isBoundPtr(val))
						el.addEventListener(
							"change",
							() => (val.value = (el as any).value)
						);
				} else {
					set(val);
				}
			} else if (attr === "checked") {
				let set = currySetVal("checked");
				if (isBasePtr(val)) {
					val.listen(set);
					if (isBoundPtr(val))
						el.addEventListener(
							"change",
							() => (val.value = (el as any).value)
						);
				} else {
					set(val);
				}
			} else if (attr.startsWith("on:")) {
				let ident = currentCssIdent;
				el.addEventListener(attr.substring(3), (e) =>
					withIdent(ident, () => val(e))
				);
			} else if (attr.startsWith("class:")) {
				let name = attr.substring(6);
				let cls = el.classList;
				let handle = (val: boolean) => {
					if (val) {
						cls.add(name);
					} else {
						cls.remove(name);
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

export { jsxFactory as h };
