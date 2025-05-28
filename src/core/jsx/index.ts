import { DOCUMENT } from "../consts";
import { createState, isBasePtr, isBoundPtr, stateProxy } from "../state";
import { cssComponent, genuid, rewriteCSS } from "../css";
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

			// propagate $nopaint to the actual element
			if (child.$nopaint) {
				newEl.$nopaint = true;
			}
			// propagate $ident to the actual element
			if (child.$ident) {
				newEl.$ident = child.$ident;
				newEl.classList.add(child.$ident);
			} else if (el.$ident) {
				newEl.$ident = el.$ident;
				newEl.classList.add(el.$ident);
			}
			newEl.$sourceptr = child;
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
		dev: {
			cssIdent += "-" + init.name;
		}

		// start of the css painting process
		// first mark the slot children as parent-managed components
		for (let child of children) {
			if (child instanceof HTMLElement || isBasePtr(child)) {
				if (child.$) continue;
				child.$nopaint = true;
			}
		}
		el = init.call(state, cx);

		const descend = (el: Node) => {
			for (let child of el.childNodes) {
				if (!(child instanceof HTMLElement)) continue;
				// console.log(child.$);
				if (child.$) continue;
				if (child.$nopaint) continue;
				child.$ident = cssIdent;
				child.classList.add(cssIdent);
				descend(child);
			}
		};
		descend(el);
		// second run, find the $nopaint elements and mark them with this tag
		const descendNopaint = (el: Node) => {
			for (let child of el.childNodes) {
				if (child.$sourceptr && child.$sourceptr.$nopaint) {
					child.$ident = cssIdent;
					child.classList.add(cssIdent);
					child.$sourceptr.$ident = cssIdent;
					continue;
				}
				if (!(child instanceof HTMLElement)) continue;
				if (child.$nopaint) {
					child.$ident = cssIdent;
					child.classList.add(cssIdent);
					if (!child.$) descend(child);
				} else {
					descendNopaint(child);
				}
			}
		};
		descendNopaint(el);
		el.$ident = cssIdent;
		el.classList.add(cssIdent);

		(el as DLElement<any>).$ = cx;

		el.classList.add(cssComponent);
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

		let currySetVal = (param: string) => (val: any) => {
			el.setAttribute(param, val);
			(el as any).value = val;
		};

		for (let child of children) {
			el.appendChild(mapChild(child, el));
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
			} else if (attr === "value") {
				let set = currySetVal("value");
				if (isBasePtr(val)) {
					val.listen(set);
					if (isBoundPtr(val))
						el.addEventListener(
							"change",
							() => (val.value = (el as any).value)
						);
					set(val.value);
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
					set(val.value);
				} else {
					set(val);
				}
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

		// all children would need to also be created with the correct namespace if we were doing this properly
		// this is annoying and expensive bundle size wise, so it's easier to just force a reparse
		// NOTE: bindings on children of svgs will be lost, and conditionals inside svgs will break
		// this is fine, no one does that anyway
		if (xmlns) el.innerHTML = el.innerHTML;
	}

	return el;
}

export { jsxFactory as h };
