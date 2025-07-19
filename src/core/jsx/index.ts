import {
	new_Comment,
	DOCUMENT,
	node,
	new_Text,
	genCssUid,
	CSS_IDENT,
} from "./dom";
import { CssInit, CSS_COMPONENT, rewriteCSS } from "../css";
import {
	Component,
	ComponentChild,
	ComponentContext,
	ComponentInstance,
	DLElement,
	DLElementNameToElement,
} from "./definitions";
import { isBasePtr, isBoundPtr } from "../state/pointers";
import { createState, stateProxy } from "../state/state";
import { DREAMLAND } from "../consts";

let currentCssIdent: string | null = null;
let hydrating: boolean = false;

let mapChild = (
	child: ComponentChild,
	parent: Node,
	cssIdent: string,
	identOverride?: string
): Node[] => {
	if (child == null) {
		return [new_Comment()];
	} else if (isBasePtr(child)) {
		let start = new_Comment("[");
		let current: Node[] = null!;

		let setNode = (val: ComponentChild) => {
			let mapped: Node[] = mapChild(val, parent, cssIdent, child._cssIdent);

			if (!hydrating && current) {
				current.map((x) => parent.removeChild(x));
				let anchor: Node = start;
				for (let child of mapped) {
					parent.insertBefore(child, anchor.nextSibling);
					anchor = child;
				}
			}
			current = mapped;
		};

		setNode(child.value);
		child.listen(setNode);

		return [start, ...current, new_Comment("]")];
	} else if (child instanceof node) {
		let list: DOMTokenList;
		let apply = (child: any) => {
			if ((list = child.classList)) {
				let arr = [...list];
				let other = arr.find((x) => x.startsWith(CSS_IDENT));

				if (arr.find((x) => x == CSS_COMPONENT)) return;

				if (!other) {
					list.add(identOverride || cssIdent);
				} else if (identOverride && other !== identOverride) {
					list.remove(other);
					list.add(identOverride);
				}

				for (let node of child.childNodes) {
					apply(node);
				}
			}
		};
		if (identOverride || cssIdent) apply(child);

		return [child];
	} else if (child instanceof Array) {
		return child.flatMap((x) => mapChild(x, parent, cssIdent, identOverride));
	} else {
		return [new_Text(child as any)];
	}
};

let CREATE_ELEMENT = "createElement";

let componentCssIdents: Map<Component, string> = new Map();
let componentCssVars: Map<Component, [string, (props: any) => any][]> =
	new Map();

function _jsx<T extends Component<any, any, any>>(
	init: T,
	props: Record<string, any> | null,
	key?: string
): ComponentInstance<T>;
function _jsx<T extends string>(
	init: T,
	props: Record<string, any> | null,
	key?: string
): DLElementNameToElement<T>;
function _jsx(
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

		let cssIdent: string | null = componentCssIdents.get(init);
		if (init.style) {
			let style = init.style;
			let styleEl = DOCUMENT[CREATE_ELEMENT]("style");
			if (!cssIdent) {
				cssIdent = genCssUid();
				if (!hydrating) {
					let cssString = "";
					let varinfo = [];

					for (let i = 0; i < style._strings.length; i++) {
						cssString += style._strings[i];
						if (i + 1 < style._strings.length) {
							let varid = genCssUid();
							cssString += `var(--${varid})`;
							varinfo.push([varid, style._funcs[i]]);
						}
					}

					styleEl["dl-" + CSS_COMPONENT] = init.name;
					DOCUMENT.head.append(styleEl);
					rewriteCSS(styleEl, cssString, cssIdent);
					componentCssIdents.set(init, cssIdent);
					componentCssVars.set(init, varinfo);
				}
			}
		}

		let cx = {
			state,
			children,
			id: cssIdent,
		} as ComponentContext<any>;

		let oldIdent = currentCssIdent;
		currentCssIdent = cssIdent;
		el = init.call(state, cx);
		currentCssIdent = oldIdent;

		(el as DLElement<any>).$ = cx;

		el.classList.add(CSS_COMPONENT);

		cx.root = el;

		let vars = componentCssVars.get(init);
		if (vars) {
			for (let [varid, func] of vars) {
				let val = func(cx.state);
				if (isBasePtr(val)) {
					val.listen((val) => {
						if (val === undefined) {
							el.style.removeProperty(`--${varid}`);
						} else {
							el.style.setProperty(`--${varid}`, val);
						}
					});
					if (val.value !== undefined) {
						el.style.setProperty(`--${varid}`, val.value);
					}
				} else if (val.value !== undefined) {
					el.style.setProperty(`--${varid}`, val);
				}
			}
		}

		cx.mount?.();
	} else {
		// <svg> elemnts need to be created with createElementNS specifically
		// we know it's an svg element if it has the xmlns attribute
		let xmlns = props?.xmlns;
		el = DOCUMENT[CREATE_ELEMENT + (xmlns ? "NS" : "")](xmlns || init, init);

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
			let ret = mapChild(child, el, currentCssIdent);
			if (!hydrating) ret.map((x) => el.appendChild(x));
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
				val.listen((val) => {
					if (val === undefined) el.removeAttribute(attr);
					else el.setAttribute(attr, val);
				});
				if (val.value !== undefined) el.setAttribute(attr, val.value);
			} else if (attr == "style" && typeof val == "object") {
				for (let k in val) {
					let set = (v: any) => (el.style[k] = v);
					let v = val[k];
					if (isBasePtr(v)) {
						set(v.value);
						v.listen(set);
					} else {
						set(v);
					}
				}
			} else {
				if (val !== undefined) el.setAttribute(attr, val);
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

function _h<T extends Component<any, any, any>>(
	init: T,
	props: Record<string, any> | null,
	...children: ComponentChild[]
): ComponentInstance<T>;
function _h<T extends string>(
	init: T,
	props: Record<string, any> | null,
	...children: ComponentChild[]
): DLElementNameToElement<T>;
function _h(
	init: Component<any, any, any> | string,
	props: Record<string, any> | null,
	...children: ComponentChild[]
): HTMLElement {
	// @ts-expect-error you suck
	return jsx(init, { children, ...props });
}

export let h = _h;
export let jsx = _jsx;
jsx[DREAMLAND] = (status: boolean) => (hydrating = status);
