import { getDom, CSS_IDENT, CssInfo } from "./dom";
import { CSS_COMPONENT, genuid } from "../css";
import {
	Component,
	ComponentChild,
	ComponentContext,
	ComponentInstance,
	DLElementNameToElement,
} from "./definitions";
import { Pointer, maybeListen } from "../state/pointers";
import { createState, stateProxy, Stateful } from "../state/state";
import { DelegateListener } from "../delegate";
import { mapChild } from "./child";

export let currentComponentCx:
	| ComponentContext<Component<any, any>>
	| undefined;
export let callDelegateListeners = (
	value: any,
	listeners: DelegateListener<any>[]
): void =>
	listeners.forEach((x) => {
		let old = currentComponentCx;
		currentComponentCx = x._cx;
		x._callback(value);
		currentComponentCx = old;
	});

let CREATE_ELEMENT = "createElement" as const;

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
	let [
		DOCUMENT,
		NODE,
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
	let lastCssIdent = currentComponentCx?.id;

	dev: {
		if (!["string", "function"].includes(typeof init))
			throw new Error("invalid component");
	}

	let { children: _children, ...props } = _props!;
	if (init === Fragment) return _children;
	if (key) props.key = key;
	_children ||= [];
	let children = _children instanceof Array ? _children : [_children];

	let el: HTMLElement;
	let setStyle = (ptr: Pointer<any>, style: CSSStyleDeclaration, k: string) =>
		maybeListen(ptr, el, (v: any) => {
			if (v === undefined) style.removeProperty(k);
			else style.setProperty(k, v);
		});

	if (typeof init === "function") {
		let state = createState({ children }) as Stateful<any>;
		let cssInfo: CssInfo | undefined = componentCssInfo.get(init);

		for (let attr in props) {
			let val = props[attr];

			if (val instanceof Pointer) {
				stateProxy(state, attr, val);
			} else {
				state[attr] = val;
			}
		}

		ssrTransform?.(init, state);

		for (let child of children) {
			// any pointers passed as children were unable to inherit the currentCssIdent.
			// we add the currentCssIdent (which is of the parent) here since we know that the pointer came from the parent.
			// this might break if pointers of elements are being passed as props but oh well
			if (child instanceof Pointer) {
				child._cssIdent ||= lastCssIdent;
			}
		}

		if (init.style) {
			let style = init.style;
			let styleEl = DOCUMENT[CREATE_ELEMENT]("style");
			if (!cssInfo) {
				cssInfo = { _id: CSS_IDENT + genCssUid(init), _vars: [] };
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

		let old = currentComponentCx;
		state.cx = cx;
		currentComponentCx = cx;
		el = init.call(state);
		currentComponentCx = old;
		state.root = el;

		if (el instanceof NODE) {
			dev: {
				if ((el as ComponentInstance<any>).$ && cssInfo)
					throw new Error("Wrapper components cannot have CSS");
			}

			(el as ComponentInstance<any>).$ = cx;

			if (init.style) el.classList.add(CSS_COMPONENT);

			if (cssInfo)
				for (let [varid, func] of cssInfo._vars) {
					let id = `--${varid}`;
					let style = el.style;
					setStyle(func(cx.state), style, id);
				}
		}

		ssrTransform?.(init, state, cx);

		currentComponentCx = cx;
		inits?.push(cx.init?.());

		if (el instanceof NODE && hydrating?.(el)) cxs?.push(cx);
		else if (hydrating) {
			mounts?.push(cx.mount?.());
		}
		currentComponentCx = old;
	} else {
		// <svg> elemnts need to be created with createElementNS specifically
		// we know it's an svg element if it has the xmlns attribute
		let xmlns = props?.xmlns;
		let setAttr = (param: string, val: any) => {
			if (hydrating?.(el)) return;

			if (val === undefined || val === false) el.removeAttribute(param);
			else el.setAttribute(param, val);
		};
		el = (DOCUMENT as any)[CREATE_ELEMENT + (xmlns ? "NS" : "")](
			xmlns || init,
			xmlns && init,
			props,
			children
		);

		for (let child of children) {
			let ret = mapChild(child, el, lastCssIdent);
			ret.forEach((x) => {
				if (x.parentNode !== el) el.appendChild(x);
			});
		}

		let classList = el.classList;

		for (let attr in props) {
			let val = props[attr];
			let oldClasses: string[] = [];
			if (attr === "this") {
				val.value = el;
			} else if (attr === "value" || attr === "checked") {
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
			} else if (attr === "class") {
				maybeListen(val, el, (val: string) => {
					// document.createElement("div").classList.{add,remove}(...[]) work
					// document.createElement("div").classList.{add,remove}(...[""]) throw
					let classes = val.split(" ").filter((x) => x.length);
					classList.remove(...oldClasses);
					classList.add(...classes);
					oldClasses = classes;
				});
			} else if (attr.startsWith("on:")) {
				el.addEventListener(attr.slice(3), val);
			} else if (attr.startsWith("class:")) {
				maybeListen(val, el, (val: boolean) => {
					classList[val ? "add" : "remove"](attr.slice(6));
				});
			} else if (attr.startsWith("attr:")) {
				maybeListen(val, el, (val: boolean) => {
					if (!hydrating?.(el)) (el as any)[attr.slice(5)] = val;
				});
			} else if (
				attr == "style" &&
				typeof val == "object" &&
				!(val instanceof Pointer)
			) {
				for (let k in val) {
					setStyle(val[k], el.style, k);
				}
			} else {
				maybeListen(val, el, (val) => setAttr(attr, val));
			}
		}

		if (lastCssIdent && ![...classList].find((x) => x.startsWith(CSS_IDENT)))
			classList.add(lastCssIdent);

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
