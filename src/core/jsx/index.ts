import { DOCUMENT } from "../consts";
import { createState, isBasePtr, isBoundPtr, stateProxy } from "../state";
import { CSS_COMPONENT, genuid, rewriteCSS } from "../css";
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
	JSX,
} from "./definitions";

let CSS_IDENT = "dlcss-";
let currentCssIdent: string | null = null;

let comment = (text?: string) => {
	return new Comment(text);
};

let mapChild = (
	child: ComponentChild,
	parent: Node,
	before: Node | null,
	cssIdent: string,
	identOverride?: string
): Node => {
	if (child == null) {
		return comment();
	} else if (isBasePtr(child)) {
		let childEl: Node = null!;

		let setNode = (val: ComponentChild) => {
			let newEl: Node = mapChild(
				val,
				parent,
				childEl,
				cssIdent,
				child._cssIdent
			);
			if (childEl) parent.replaceChild(newEl, childEl);
			childEl = newEl;
		};

		setNode(child.value);
		child.listen(setNode);
		return childEl;
	} else if (child instanceof Node) {
		let apply = (child: Node) => {
			if (child instanceof HTMLElement) {
				let list = child.classList;
				let arr = Array.from(list);
				let other = arr.find((x) => x.startsWith(CSS_IDENT));

				if (arr.find((x) => x === CSS_COMPONENT)) return;

				if (!other) {
					list.add(identOverride || cssIdent);
				} else if (identOverride && other !== identOverride) {
					list.remove(other);
					list.add(identOverride);
				}

				for (let node of Array.from(child.childNodes)) {
					apply(node);
				}
			}
		};
		if (identOverride || cssIdent) apply(child);

		return child;
	} else if (child instanceof Array) {
		// TODO make this smarter
		let uid: string, start: Comment, end: Comment;
		let children = Array.from(parent.childNodes);
		if (!before) {
			uid = "dlarr-" + genuid();
			start = comment(uid);
			end = comment(uid);
			parent.appendChild(start);
			parent.appendChild(end);
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
		for (let x of current) parent.removeChild(x);

		let anchor: Node = end;
		for (let x of [...child].reverse()) {
			let mapped = mapChild(x, parent, null, cssIdent, identOverride);
			parent.insertBefore(mapped, anchor);
			anchor = mapped;
		}

		return end;
	} else {
		return new Text(child as any);
	}
};
function jsx<T extends Component<any, any, any>>(
	init: T,
	props: Record<string, any> | null,
	key?: string
): ComponentInstance<T>;
function jsx<T extends string>(
	init: T,
	props: Record<string, any> | null,
	key?: string
): DLElementNameToElement<T>;
function jsx(
	init: Component<any, any, any> | string,
	_props: Record<string, any> | null,
	key?: string
): HTMLElement {
	dev: {
		if (!["string", "function"].includes(typeof init))
			throw new Error("invalid component");
	}

	let { children: _children, ...props } = _props;
	if (key) props.key = key;
	_children ||= [];
	let children = _children instanceof Array ? _children : [_children];

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

		for (let child of children) {
			// any pointers passed as children were unable to inherit the currentCssIdent.
			// we add the currentCssIdent (which is of the parent) here since we know that the pointer came from the parent.
			// this might break if pointers of elements are being passed as props but oh well
			if (isBasePtr(child)) {
				child._cssIdent ||= currentCssIdent;
			}
		}

		let cx = Object.create(init.prototype) as ComponentContext<any>;
		cx.state = state;
		cx.children = children;

		let cssIdent = CSS_IDENT + genuid();
		dev: {
			cssIdent += "-" + init.name;
		}

		let oldIdent = currentCssIdent;
		currentCssIdent = cssIdent;
		el = init.call(state, cx);
		currentCssIdent = oldIdent;

		(el as DLElement<any>).$ = cx;

		el.classList.add(CSS_COMPONENT);
		if (cx.css) {
			let el = DOCUMENT.createElement("style");
			el.innerText = rewriteCSS(cx.css, cssIdent);
			DOCUMENT.head.append(el);
		}

		cx.root = el;
		cx.mount?.();
	} else {
		// <svg> elemnts need to be created with createElementNS specifically
		// we know it's an svg element if it has the xmlns attribute
		let xmlns = props?.xmlns;
		el = DOCUMENT["createElement" + (xmlns ? "NS" : "")](xmlns || init, init);

		let currySetVal = (param: string, val: any) => {
			let set = (val: any) => {
				el.setAttribute(param, val);
				(el as any).value = val;
			};

			if (isBasePtr(val)) {
				val.listen(set);
				if (isBoundPtr(val))
					el.addEventListener("change", () => (val.value = (el as any).value));
				set(val.value);
			} else {
				set(val);
			}
		};

		for (let child of children) {
			el.appendChild(mapChild(child, el, null, currentCssIdent));
		}

		for (let attr in props) {
			let val = props[attr];
			if (attr === "this") {
				dev: {
					if (!isBoundPtr(val)) {
						throw new Error("this prop value must be a bound pointer");
					}
				}
				val.value = el;
			} else if (attr === "value" || attr === "checked") {
				currySetVal(attr, val);
			} else if (attr === "class" && isBasePtr(val)) {
				let classList = el.classList;
				let old = [];
				let set = (val: string) => {
					let classes = val.split(" ").filter((x) => x.length);
					if (old.length) classList.remove(...old);
					if (classes.length) classList.add(...classes);
					old = classes;
				};
				set(val.value);
				val.listen(set);
			} else if (attr.startsWith("on:")) {
				el.addEventListener(attr.substring(3), (e) => val(e));
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

		// all children would need to also be created with the correct namespace if we were doing this properly
		// this is annoying and expensive bundle size wise, so it's easier to just force a reparse
		// NOTE: bindings on children of svgs will be lost, and conditionals inside svgs will break
		// this is fine, no one does that anyway
		if (xmlns) el.innerHTML = el.innerHTML;
	}

	return el;
}

function h<T extends Component<any, any, any>>(
	init: T,
	props: Record<string, any> | null,
	...children: ComponentChild[]
): ComponentInstance<T>;
function h<T extends string>(
	init: T,
	props: Record<string, any> | null,
	...children: ComponentChild[]
): DLElementNameToElement<T>;
function h(
	init: Component<any, any, any> | string,
	props: Record<string, any> | null,
	...children: ComponentChild[]
): HTMLElement {
	// @ts-expect-error you suck
	return jsx(init, { children, ...props });
}

export { jsx, h };
