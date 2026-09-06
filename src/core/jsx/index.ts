import {
	getDom,
	CREATE_ELEMENT,
	DomLifecycleState as Lifecycle,
	DomLifecycleCallback,
} from "./dom";
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
import { flattenChildRet, mapChild } from "./child";
import { NO_CHANGE } from "../consts";
import { currentComponentCx, withCx } from "../cx";

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

let runLifecycle = (
	lifecycle: DomLifecycleCallback,
	stage: Lifecycle,
	cx: ComponentContext<any>,
	cb?: () => Pointer<any> | any,
	prev?: Pointer<any> | any
): Pointer<any> | any => {
	let ret;
	if (!cb) return prev;
	ret =
		prev && prev instanceof Promise
			? prev.then(() => withCx(cx, cb))
			: withCx(cx, cb);
	lifecycle(stage, cx, ret);
	return ret;
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

	dev: {
		if (!["string", "function"].includes(typeof init))
			throw new Error("invalid component");
	}

	let [DOCUMENT, NODE] = getDom();
	let children = props.children;
	let el: HTMLElement;

	if (init === Fragment) return children;
	if (key) props.key = key;

	if (typeof init === "function") {
		let [, , , , genCssUid, isAdopted, lifecycle, componentCb] = getDom();

		let _state: any = { children };
		let state = createState(_state) as Stateful<any>;

		let lifeTmp: any;

		let style = init.style;
		let cssId = style?._get(DOCUMENT, isAdopted, genCssUid, init);
		let cx = {
			state,
			id: cssId,
			[NO_CHANGE]: [],
		} as ComponentContext<any>;

		for (let attr in props) {
			if (attr == "children") continue;

			let val = props[attr];

			if (val instanceof Pointer) {
				stateProxy(state, attr, val);
			} else {
				_state[attr] = val;
			}
		}

		componentCb?.(init, state);

		_state.cx = cx;
		el = withCx(cx, init, state, state);
		_state.root = el;

		dev: {
			if (cssId && !(el instanceof NODE))
				throw new Error("Fragment/data components cannot have CSS");
		}

		if (el instanceof NODE) {
			dev: {
				if ((el as ComponentInstance<any>).$ && cssId)
					throw new Error("Wrapper components cannot have CSS");
			}

			if (!(el as ComponentInstance<any>).$)
				(el as ComponentInstance<any>).$ = cx;

			if (cssId) {
				el.setAttribute(CSS_COMPONENT, "");
				style!._vars!.forEach(([i, func]) =>
					setStyle(el, func(cx.state), el.style, `--${cssId}-${i}`)
				);
			}
		}

		componentCb?.(init, state, cx);

		lifeTmp = runLifecycle(lifecycle, Lifecycle.Load, cx, cx.load);
		lifeTmp = runLifecycle(lifecycle, Lifecycle.Init, cx, cx.init, lifeTmp);
		runLifecycle(lifecycle, Lifecycle.Mount, cx, cx.mount, lifeTmp);
	} else {
		// <svg> elemnts need to be created with createElementNS specifically
		// we know it's an svg element if it has the xmlns attribute
		let xmlns = props?.xmlns;
		let lastCssIdent = currentComponentCx?.id;
		let setAttr = (param: string, val: any) => {
			if (getDom()[5](el)) return;

			if (val === undefined || val === false) el.removeAttribute(param);
			else el.setAttribute(param, val);
		};
		// last class list only matters when the fastpath is gone due to something setting additional classes on it
		let lastClassList: string[] | undefined, classList: DOMTokenList;

		el = (DOCUMENT as any)[CREATE_ELEMENT + (xmlns ? "NS" : "")](
			xmlns || init,
			xmlns && init,
			props,
			children
		);

		if (children !== undefined) {
			let lastChildNode: Node;
			flattenChildRet(mapChild(children, el, lastCssIdent)).forEach((x) => {
				if (x.parentNode !== el)
					el.insertBefore(
						x,
						lastChildNode ? lastChildNode.nextSibling : el.firstChild
					);
				lastChildNode = x;
			});
		}

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
					if (!getDom()[5](el)) (el as any)[attr.slice(5)] = val;
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

		if (lastCssIdent) {
			el.setAttribute(lastCssIdent, "");
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
