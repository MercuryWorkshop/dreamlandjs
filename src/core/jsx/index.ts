import { DOCUMENT } from "../consts";
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
import { isBasePtr, isBoundPtr } from "../state/pointers";
import { createState, stateProxy } from "../state/state";

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

let comment = (text?: string) => new Comment(text);

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

		return child;
	} else if (child instanceof Array) {
		let uid: string, end: Comment;
		let children = [...parent.childNodes];
		let current: Node[];

		if (!before) {
			uid = "dlarr-" + genuid();
			parent.appendChild(comment(uid));
			end = parent.appendChild(comment(uid));
			current = [];
		} else {
			uid = (before as Comment).data;
			end = before as Comment;
			let start = children.findIndex(
				(x) => x.nodeType == 8 && (x as Comment).data == uid
			);
			let endIdx = children.findIndex((x) => x === end);
			current = children.slice(start, endIdx);
		}
		if (!end) fatal();

		current.forEach((x) => parent.removeChild(x));

		let anchor: Node = end;
		for (let x of child.reverse()) {
			let mapped = mapChild(x, parent, null, cssIdent, identOverride);
			parent.insertBefore(mapped, anchor);
			anchor = mapped;
		}

		return end;
	} else {
		return new Text(child as any);
	}
};

let CREATE_ELEMENT = "createElement";

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

		let cx = { state, children } as ComponentContext<any>;

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
			let el = DOCUMENT[CREATE_ELEMENT]("style");
			DOCUMENT.head.append(el);
			rewriteCSS(el, cx.css, cssIdent);
		}

		cx.root = el;
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

/**
 * Hydrates an existing DOM tree with DreamlandJS component functionality.
 * 
 * This function allows you to take an existing DOM structure (e.g., from server-side rendering
 * or static HTML) and attach DreamlandJS component state, event listeners, and reactivity to it
 * without recreating the DOM from scratch.
 * 
 * @param rootElement - The existing DOM element to hydrate
 * @param component - The DreamlandJS component function to hydrate with
 * @param props - Props to pass to the component (default: {})
 * @param children - Children to pass to the component (default: [])
 * @returns The hydrated element with DreamlandJS functionality attached
 * 
 * @example
 * ```typescript
 * // Existing HTML: <div id="app"><h1>Hello</h1><p>World</p></div>
 * 
 * function MyComponent() {
 *   this.count = 0;
 *   return h("div", null,
 *     h("h1", null, "Hello"),
 *     h("p", { "on:click": () => this.count++ }, use(this.count))
 *   );
 * }
 * 
 * const existingElement = document.getElementById("app");
 * const hydratedElement = hydrate(existingElement, MyComponent);
 * ```
 * 
 * Caveats:
 * - The existing DOM structure should match the component's expected structure
 * - Text content may be replaced during hydration if it contains reactive values
 * - CSS classes from DreamlandJS will be added to existing elements
 * - Event listeners will be attached to existing elements
 * - This is a simplified implementation - complex reactive bindings may need manual setup
 */
export function hydrate<T extends Component<any, any, any>>(
	rootElement: HTMLElement,
	component: T,
	props: Record<string, any> = {},
	children: ComponentChild[] = []
): ComponentInstance<T> {
	// Create component state and context similar to jsx function
	let state = createState({});
	for (let attr in props) {
		let val = props[attr];
		if (isBasePtr(val)) {
			stateProxy(state, attr, val);
		} else {
			state[attr] = val;
		}
	}

	// Set up CSS ident for child components
	for (let child of children) {
		if (isBasePtr(child)) {
			child._cssIdent ||= currentCssIdent;
		}
	}

	let cx = { state, children } as ComponentContext<any>;

	let cssIdent = CSS_IDENT + genuid();
	dev: {
		cssIdent += "-" + component.name;
	}

	// Store original CSS ident and set it for this component
	let oldIdent = currentCssIdent;
	currentCssIdent = cssIdent;
	
	// Call the component function to set up state and get the expected structure
	// NOTE: This will create DOM elements, but we'll discard them and use the existing ones
	let expectedElement = component.call(state, cx);
	
	currentCssIdent = oldIdent;

	// Apply hydration to the existing element
	// We'll copy relevant properties and apply DreamlandJS features
	hydrateElement(rootElement, expectedElement, cssIdent);

	// Attach component context to the root element
	(rootElement as DLElement<any>).$ = cx;
	
	// Add component CSS class
	rootElement.classList.add(CSS_COMPONENT);
	
	// Handle CSS if the component defined any
	if (cx.css) {
		let styleEl = DOCUMENT[CREATE_ELEMENT]("style");
		DOCUMENT.head.append(styleEl);
		rewriteCSS(styleEl, cx.css, cssIdent);
	}

	// Set up context - point to the hydrated element instead of expected element
	cx.root = rootElement;
	cx.mount?.();

	return rootElement as ComponentInstance<T>;
}

/**
 * Helper function to hydrate a single element and its children.
 * This function copies CSS classes and attributes from the expected element
 * to the existing element to apply DreamlandJS styling and behavior.
 */
function hydrateElement(
	existingElement: HTMLElement,
	expectedElement: HTMLElement, 
	cssIdent: string
): void {
	// Add CSS ident to existing element  
	if (cssIdent && !existingElement.classList.contains(CSS_COMPONENT)) {
		existingElement.classList.add(cssIdent);
	}

	// Copy CSS classes from expected element to existing element
	for (let className of expectedElement.classList) {
		if (!existingElement.classList.contains(className)) {
			existingElement.classList.add(className);
		}
	}

	// Copy data attributes and other attributes that might be needed
	for (let attr of expectedElement.getAttributeNames()) {
		if (!existingElement.hasAttribute(attr) && 
			(attr.startsWith('data-') || attr.startsWith('aria-') || 
			 ['id', 'role', 'tabindex'].includes(attr))) {
			existingElement.setAttribute(attr, expectedElement.getAttribute(attr)!);
		}
	}

	// Recursively hydrate child elements by matching them up
	hydrateChildren(existingElement, expectedElement, cssIdent);
}

/**
 * Hydrates children by matching existing child nodes with expected child nodes.
 */
function hydrateChildren(
	existingElement: HTMLElement,
	expectedElement: HTMLElement,
	cssIdent: string
): void {
	let existingChildren = Array.from(existingElement.childNodes);
	let expectedChildren = Array.from(expectedElement.childNodes);

	// Match children by index and node type
	for (let i = 0; i < Math.min(existingChildren.length, expectedChildren.length); i++) {
		let existingChild = existingChildren[i];
		let expectedChild = expectedChildren[i];

		if (existingChild.nodeType === expectedChild.nodeType) {
			if (existingChild.nodeType === Node.ELEMENT_NODE) {
				// Recursively hydrate child elements
				hydrateElement(
					existingChild as HTMLElement,
					expectedChild as HTMLElement,
					cssIdent
				);
			} else if (existingChild.nodeType === Node.TEXT_NODE) {
				// For text nodes, we'll leave existing content as-is unless it's completely empty
				// This allows for progressive enhancement where the server-rendered content 
				// might be more complete than the initial component state
				if (!existingChild.textContent?.trim() && expectedChild.textContent?.trim()) {
					existingChild.textContent = expectedChild.textContent;
				}
			}
		}
	}

	// Note: We don't automatically add or remove children during hydration
	// This preserves the existing DOM structure and allows for progressive enhancement
}
