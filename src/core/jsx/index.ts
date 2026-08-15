import { getDom, CSS_IDENT, CssInfo } from "./dom";
import { CSS_COMPONENT } from "../css";
import {
	Component,
	ComponentChild,
	ComponentContext,
	ComponentInstance,
	DLElementNameToElement,
} from "./definitions";
import { Pointer, maybeListen } from "../state/pointers";
import { createState, stateProxy, Stateful } from "../state/state";
import { Delegate, DelegateListener } from "../delegate";
import { flattenChildRet, mapChild } from "./child";
import { NO_CHANGE } from "../consts";

export let currentComponentCx:
	| ComponentContext<Component<any, any>>
	| undefined;

// has to be here since it assigns currentComponentCx and terser is terrible at inlining iifes fully
export let _createDelegate = <T>(): Delegate<T> => {
	let listeners: DelegateListener<T>[] = [];

	let delegate = ((value: any): void =>
		listeners.forEach((x) => {
			let old = currentComponentCx;
			currentComponentCx = x._cx;
			x._callback(value);
			currentComponentCx = old;
		})) as Delegate<T>;

	delegate.listen = (_callback: (value: T) => void) => {
		listeners.push({
			_callback,
			_cx: currentComponentCx,
		});
	};

	return delegate;
};

let CREATE_ELEMENT = "createElement" as const;

let setStyle = (
	el: HTMLElement,
	ptr: Pointer<any>,
	style: CSSStyleDeclaration,
	k: string
) =>
	maybeListen(ptr, el, (v: any) => {
		if (v === undefined) style.removeProperty(k);
		else style.setProperty(k, v);
	});

let iterateChildren = (children: any, cb: (child: any) => void) => {
	if (children instanceof Array) children.forEach(cb);
	else if (children) cb(children);
};

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
	props: Record<string, any> | null,
	key?: string
): HTMLElement {
	props ||= {};

	let [DOCUMENT, NODE] = getDom();
	let lastCssIdent = currentComponentCx?.id;

	dev: {
		if (!["string", "function"].includes(typeof init))
			throw new Error("invalid component");
	}

	let children = props.children;
	if (init === Fragment) return children;
	if (key) props.key = key;

	let el: HTMLElement;

	if (typeof init === "function") {
		let [
			,
			,
			,
			,
			genCssUid,
			componentCssInfo,
			hydrating,
			ssrTransform,
			cxs,
			inits,
			mounts,
		] = getDom();
		let state = createState({ children }) as Stateful<any>;
		let cssInfo: CssInfo | undefined = componentCssInfo.get(init);
		let tmp;

		for (let attr in props) {
			if (attr == "children") continue;

			let val = props[attr];

			if (val instanceof Pointer) {
				stateProxy(state, attr, val);
			} else {
				state[attr] = val;
			}
		}

		ssrTransform?.(init, state);

		iterateChildren(children, (child) => {
			// any pointers passed as children were unable to inherit the currentCssIdent.
			// we add the currentCssIdent (which is of the parent) here since we know that the pointer came from the parent.
			// this might break if pointers of elements are being passed as props but oh well
			if (child instanceof Pointer) {
				child._cssIdent ||= lastCssIdent;
			}
		});

		if (init.style) {
			let style = init.style;
			let styleEl = DOCUMENT[CREATE_ELEMENT]("style");
			if (!cssInfo) {
				cssInfo = { _id: CSS_IDENT + genCssUid(init), _vars: [] };
				let cssString = style._build(style, cssInfo);

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
			[NO_CHANGE]: [],
		} as ComponentContext<any>;

		let old = currentComponentCx;
		state.cx = cx;
		currentComponentCx = cx;
		el = init.call(state);
		currentComponentCx = old;
		state.root = el;

		dev: {
			if (cssInfo && !(el instanceof NODE))
				throw new Error("Fragment/data components cannot have CSS");
		}

		if (el instanceof NODE) {
			dev: {
				if ((el as ComponentInstance<any>).$ && cssInfo)
					throw new Error("Wrapper components cannot have CSS");
			}

			if (!(el as ComponentInstance<any>).$)
				(el as ComponentInstance<any>).$ = cx;

			if (cssInfo) {
				el.classList.add(CSS_COMPONENT);
				cssInfo._vars.forEach(([id, func]) =>
					setStyle(el, func(cx.state), el.style, id)
				);
			}
		}

		ssrTransform?.(init, state, cx);

		currentComponentCx = cx;
		tmp = cx.init?.();
		inits?.push(tmp);

		if (el instanceof NODE && hydrating?.(el)) cxs?.push(cx);
		else if (hydrating) {
			tmp = cx.mount?.();
			mounts?.push(tmp);
		}
		currentComponentCx = old;
	} else {
		// <svg> elemnts need to be created with createElementNS specifically
		// we know it's an svg element if it has the xmlns attribute
		let xmlns = props?.xmlns;
		let setAttr = (param: string, val: any) => {
			if (getDom()[6]?.(el)) return;

			if (val === undefined || val === false) el.removeAttribute(param);
			else el.setAttribute(param, val);
		};
		// last class list only matters when the fastpath is gone due to something setting additional classes on it
		let lastClassList: string[] | undefined,
			classList: DOMTokenList,
			lastChildNode: Node;

		el = (DOCUMENT as any)[CREATE_ELEMENT + (xmlns ? "NS" : "")](
			xmlns || init,
			xmlns && init,
			props,
			children
		);

		if (children !== undefined)
			flattenChildRet(mapChild(children, el, lastCssIdent)).forEach((x) => {
				if (x.parentNode !== el) el.insertBefore(x, lastChildNode ? lastChildNode.nextSibling : el.firstChild);
				lastChildNode = x;
			});

		classList = el.classList;

		for (let attr in props) {
			if (attr == "children") continue;

			let val = props[attr];
			if (attr == "this") {
				val.value = el;
			} else if (attr == "value" || attr == "checked") {
				maybeListen(
					val,
					el,
					(val: any) => {
						setAttr(attr, val);
						(el as any)[attr] = val;
					},
					() => {
						el.addEventListener("input", () => (val.value = (el as any)[attr]));
					}
				);
			} else if (attr == "class") {
				maybeListen(val, el, (val: string) => {
					// document.createElement("div").classList.{add,remove}(...[]) work
					// document.createElement("div").classList.{add,remove}(...[""]) throw
					if (lastClassList) {
						classList.remove(...lastClassList);
						classList.add(
							...(lastClassList = val.split(" ").filter((x) => x.length))
						);
					} else {
						classList.value = val;
					}
				});
			} else if (attr.startsWith("on:")) {
				el.addEventListener(attr.slice(3), val);
			} else if (attr.startsWith("class:")) {
				maybeListen(val, el, (val: boolean) => {
					lastClassList ||= [...classList];
					classList[val ? "add" : "remove"](attr.slice(6));
				});
			} else if (attr.startsWith("attr:")) {
				maybeListen(val, el, (val: boolean) => {
					if (!getDom()[6]?.(el)) (el as any)[attr.slice(5)] = val;
				});
			} else if (
				attr == "style" &&
				typeof val == "object" &&
				!(val instanceof Pointer)
			) {
				for (let k in val) {
					setStyle(el, val[k], el.style, k);
				}
			} else {
				maybeListen(val, el, (val) => setAttr(attr, val));
			}
		}

		if (lastCssIdent && ![...classList].find((x) => x.startsWith(CSS_IDENT))) {
			lastClassList ||= [...classList];
			classList.add(lastCssIdent);
		}

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
export let jsx = _jsx;

export let Fragment = ((_: any) => 0) as any as Component<{
	children?: ComponentChild;
}>;
