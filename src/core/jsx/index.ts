import {
	new_Comment,
	DOCUMENT,
	new_Text,
	genCssUid,
	CSS_IDENT,
	hydrating,
	ssrTransform,
} from "./dom";
import { CSS_COMPONENT, genuid } from "../css";
import {
	Component,
	ComponentChild,
	ComponentContext,
	ComponentInstance,
	DLElementNameToElement,
} from "./definitions";
import { DEFAULT_CONSTRAINER, isPointer, maybeListen, setConstrainer } from "../state/pointers";
import { createState, stateProxy, Stateful } from "../state/state";
import { DREAMLAND, MAP, NO_CHANGE } from "../consts";
import { DelegateListener } from "../delegate";
import { findLIS, isArray, isNode } from "../utils";

export let currentCssIdent: string | undefined;
export let callDelegateListeners = (
	value: any,
	listeners: DelegateListener<any>[]
): void =>
	listeners.map((x) => {
		let oldIdent = currentCssIdent;
		let oldConstrainer = DEFAULT_CONSTRAINER;
		setConstrainer(x._constrainer);
		currentCssIdent = x._cssIdent;
		x._callback(value);
		currentCssIdent = oldIdent;
		setConstrainer(oldConstrainer)
	}) as any as void;

let isBlacklisted = (val: any): val is null | undefined | boolean => [null, undefined, false, true].includes(val);

let mapChild = (
	child: ComponentChild,
	parent: Node,
	cssIdent?: string,
	identOverride?: string
): Node[] => {
	if (isBlacklisted(child)) {
		return [new_Comment()];
	} else if (isPointer(child)) {
		let start = new_Comment("[");
		let end = new_Comment("]");
		let current: Node[];

		maybeListen(child, start, (val: ComponentChild) => {
			if (current && !start.parentNode) return;
			let mapped: Node[] = mapChild(val, parent, cssIdent, child._cssIdent);

			// pretty sure it's not possible to put a pointer child in not a htmlelement
			if (!hydrating?.(parent as HTMLElement) && current) {
				let old = MAP(current.map((x, i) => [x, i]));
				let staticNodes = mapped.map((x) => old.get(x)!).filter((x) => x);
				let LIS = MAP(findLIS(staticNodes).map((x) => [current[x], ,]));
				let anchor: Node = start;

				mapped.map((child) => {
					if (!old.has(child) || !LIS.has(child)) {
						parent.insertBefore(child, anchor.nextSibling);
					}
					anchor = child;
				});

				current
					.filter((x) => !mapped.includes(x) && x.parentNode === parent)
					.map((child) => parent.removeChild(child));
			}
			current = mapped;
		});

		return [
			start,
			...(hydrating?.(parent as HTMLElement) ? [] : current!),
			end,
		];
	} else if (isNode(child)) {
		let list: DOMTokenList;
		let apply = (child: any) => {
			if ((list = child.classList)) {
				let arr = [...list];
				let other = arr.find((x) => x.startsWith(CSS_IDENT));

				if (arr.find((x) => x == CSS_COMPONENT)) return;

				if (!other) {
					list.add(identOverride || cssIdent!);
				} else if (identOverride && other !== identOverride) {
					list.remove(other);
					list.add(identOverride);
				}

				[...child.childNodes].map(apply);
			}
		};
		if (identOverride || cssIdent) apply(child);

		return [child];
	} else if (isArray(child)) {
		return child.flatMap((x) => mapChild(x, parent, cssIdent, identOverride));
	} else {
		return [new_Text(child as string)];
	}
};

let CREATE_ELEMENT = "createElement" as const;

interface CssInfo {
	_id: string;
	_vars: [string, (props: any) => any][];
}

let componentCssInfo: Map<Component, CssInfo> = MAP();
let cxs: ComponentContext<Component<any, any>>[] = [];

function _jsx<T extends Component<any, any>>(
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
	init: Component<any, any> | string,
	_props: Record<string, any> | null,
	key?: string
): HTMLElement {
	dev: {
		if (!["string", "function"].includes(typeof init))
			throw new Error("invalid component");
	}

	let { children: _children, ...props } = _props!;
	if (key) props.key = key;
	_children ||= [];
	let children = isArray(_children) ? _children : [_children];

	let el: HTMLElement;

	if (typeof init === "function") {
		let state = createState({ children }) as Stateful<any>;

		ssrTransform?.(init);

		for (let attr in props) {
			let val = props[attr];

			if (isPointer(val)) {
				stateProxy(state, attr, val);
			} else {
				state[attr] = val;
			}
		}

		for (let child of children) {
			// any pointers passed as children were unable to inherit the currentCssIdent.
			// we add the currentCssIdent (which is of the parent) here since we know that the pointer came from the parent.
			// this might break if pointers of elements are being passed as props but oh well
			if (isPointer(child)) {
				child._cssIdent ||= currentCssIdent;
			}
		}

		let cssInfo: CssInfo | undefined = componentCssInfo.get(init);
		if (init.style) {
			let style = init.style;
			let styleEl = DOCUMENT[CREATE_ELEMENT]("style");
			if (!cssInfo) {
				cssInfo = { _id: genCssUid(), _vars: [] };
				let cssString = "";

				for (let i = 0; i < style._strings.length; i++) {
					cssString += style._strings[i];
					if (i + 1 < style._strings.length) {
						let func = style._funcs[i];
						if (typeof func === "string") {
							cssString += func;
						} else {
							let varid = genuid();
							cssString += `var(--${varid})`;
							cssInfo._vars.push([varid, func]);
						}
					}
				}

				if (!hydrating?.(styleEl)) {
					styleEl.setAttribute(CSS_COMPONENT, init.name);
					styleEl.setAttribute(CSS_IDENT + "id", cssInfo._id);

					DOCUMENT.head.append(styleEl);
					style._rewrite(styleEl, cssString, cssInfo._id);
				}
				componentCssInfo.set(init, cssInfo);
			}
		}

		let cx = {
			state,
			id: cssInfo?._id,
		} as ComponentContext<any>;

		let constrainer = DEFAULT_CONSTRAINER;
		setConstrainer(state);
		let oldIdent = currentCssIdent;
		state.cx = cx;
		currentCssIdent = cssInfo?._id;
		el = init.call(state);
		currentCssIdent = oldIdent;
		state.root = el;

		setConstrainer(constrainer);

		if (isNode(el)) {
			dev: {
				if ((el as ComponentInstance<any>).$ && cssInfo)
					throw new Error("Wrapper components cannot have CSS");
			}

			(el as ComponentInstance<any>).$ = cx;

			el.classList.add(CSS_COMPONENT);

			if (cssInfo)
				for (let [varid, func] of cssInfo._vars) {
					let id = `--${varid}`;
					let style = el.style;

					maybeListen(func(cx.state), el, (val: any) => {
						if (val === undefined) style.removeProperty(id);
						else style.setProperty(id, val);
					});
				}
		}

		ssrTransform?.(init, cx);

		setConstrainer(state);
		cx.init?.();

		if (isNode(el) && hydrating?.(el)) cxs.push(cx);
		else if (hydrating) cx.mount?.();
		setConstrainer(constrainer);
	} else {
		// <svg> elemnts need to be created with createElementNS specifically
		// we know it's an svg element if it has the xmlns attribute
		let xmlns = props?.xmlns;
		el = (DOCUMENT as any)[CREATE_ELEMENT + (xmlns ? "NS" : "")](
			xmlns || init,
			xmlns && init,
			props,
			children
		);

		let setAttr = (param: string, val: any) => {
			if (hydrating?.(el)) return;

			if (val === undefined || val === false) el.removeAttribute(param);
			else el.setAttribute(param, val);
		};

		for (let child of children) {
			let ret = mapChild(child, el, currentCssIdent);
			ret.map((x) => {
				if (x.parentNode !== el) el.appendChild(x);
			});
		}

		let classList = el.classList;

		for (let attr in props) {
			let val = props[attr];
			if (attr === "this") {
				val.value = el;
			} else if (attr === "value" || attr === "checked") {
				maybeListen(
					val,
					el,
					(val: any) => {
						setAttr(attr, val);
						(el as any).value = val;
					},
					() => {
						el.addEventListener("input", () => (val.value = (el as any)[attr]));
					}
				);
			} else if (attr === "class") {
				let old: string[] = [];

				maybeListen(val, el, (val: string) => {
					let classes = val.split(" ").filter((x) => x.length);
					if (old.length) classList.remove(...old);
					if (classes.length) classList.add(...classes);
					old = classes;
				});
			} else if (attr.startsWith("on:")) {
				if (val) el.addEventListener(attr.substring(3), (e) => val(e));
			} else if (attr.startsWith("class:")) {
				let name = attr.substring(6);

				maybeListen(val, el, (val: boolean) => {
					if (val) {
						classList.add(name);
					} else {
						classList.remove(name);
					}
				});
			} else if (attr.startsWith("attr:")) {
				let key = attr.substring(5);
				maybeListen(val, el, (val: boolean) => {
					if (!hydrating?.(el)) (el as any)[key] = val;
				});
			} else if (attr == "style" && typeof val == "object" && !isPointer(val)) {
				for (let k in val) {
					maybeListen(val[k], el, (v: any) => {
						el.style.setProperty(k, v);
					});
				}
			} else {
				maybeListen(val, el, (val) => setAttr(attr, val));
			}
		}

		if (currentCssIdent && ![...classList].find((x) => x.startsWith(CSS_IDENT)))
			classList.add(currentCssIdent);

		// all children would need to also be created with the correct namespace if we were doing this properly
		// this is annoying and expensive bundle size wise, so it's easier to just force a reparse
		// NOTE: bindings on children of svgs will be lost, and conditionals inside svgs will break
		// this is fine, no one does that anyway
		// eslint-disable-next-line no-self-assign
		if (xmlns) el.innerHTML = el.innerHTML;
	}

	return el;
}

function _h<T extends Component<any, any>>(
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
	init: Component<any, any> | string,
	props: Record<string, any> | null,
	...children: ComponentChild[]
): HTMLElement {
	// @ts-expect-error you suck
	return jsx(init, { children, ...props });
}

export let h = _h;
export let jsx: typeof _jsx & {
	[DREAMLAND]: () => void;
	[NO_CHANGE]: () => ComponentContext<Component<any, any>>[];
} = _jsx as any;
export let addDREAMLAND = () => {
	jsx[DREAMLAND] = () => (componentCssInfo = MAP());
	jsx[NO_CHANGE] = () => cxs.splice(0, cxs.length);
};

export let Fragment: Component<{ children?: ComponentChild }> = function () {
	return this.children as any as JSX.Element;
};
