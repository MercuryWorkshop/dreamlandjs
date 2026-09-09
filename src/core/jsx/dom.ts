import { genuid } from "../css";
import { Component, ComponentContext, ComponentState } from "./definitions";

export let CREATE_ELEMENT = "createElement" as const;

export interface DomDocument {
	head: DomElement;

	createElement(localName: "style"): DomStyleElement;
	/// xmlns is always going to be string, but for compat with dom {} is included
	createElement(
		localName: string,
		xmlns?: string | {},
		cx?: ComponentContext<any>
	): DomElement;

	createElementNS(
		xmlns: string,
		qualifiedName: string,
		cx?: ComponentContext<any>
	): DomElement;
}

export interface DomNode {
	parentNode: DomNode | null;

	childNodes: { forEach(cb: (node: DomNode) => void): void };
	firstChild: DomNode | null;
	nextSibling: DomNode | null;

	insertBefore(newNode: DomNode, referenceNode: DomNode | null): void;
	removeChild(child: DomNode): void;
}
export type DomNodeClass = abstract new (...args: any[]) => DomNode;

export interface DomElement extends DomNode {
	classList: DomClassList;

	/// the one prop that is from HTMLElement, not Element
	style: DomStyleDeclaration;

	innerHTML: string;
	innerText: string;

	append(...items: (DomNode | string)[]): void;

	getAttribute(qualifiedName: string): string | null;
	getAttributeNames(): string[];
	hasAttribute(qualifiedName: string): boolean;
	setAttribute(qualifiedName: string, value: string): void;
	removeAttribute(qualifiedName: string): void;

	addEventListener(type: string, listener: (ev: any) => void): void;
}
export interface DomClassList {
	value: string;

	add(...tokens: string[]): void;
	remove(...tokens: string[]): void;

	[Symbol.iterator](): IterableIterator<string>;
}
export interface DomStyleDeclaration {
	setProperty(propertyName: string, value: string | null): void;
	removeProperty(property: string): string;
}
export interface DomTextNode extends DomNode {
	data: string;
}
export interface DomCommentNode extends DomNode {
	data: string;
}

export interface DomStyleElement extends DomElement {
	sheet: DomStyleSheet;
}
export interface DomStyleSheet {
	cssRules: DomCSSRuleList;
}
export interface DomCSSRuleList {
	[Symbol.iterator](): IterableIterator<DomCSSRule>;
}
export interface DomCSSRule {
	cssText: string;

	// these are actually from subclasses of CSSRule but it doesnt matter
	cssRules?: DomCSSRuleList;
	selectorText?: string;
}

export type DomCssUidGenerator = (
	init: Component<any, any>,
	style: DomStyleElement
) => string;
export type DomIsAdopted = (el: DomElement) => boolean;

export const enum DomComponentState {
	BeforeComponentInit = 1,
	AfterComponentInit = 2,
}
export type DomComponentCallback = <T extends Component<any, any>>(
	stage: DomComponentState,
	init: T,
	state: ComponentState<T>,
	cx: ComponentContext<T>
) => void;

export const enum DomLifecycleState {
	Load = 1,
	Init = 2,
	Mount = 3,
}
export type DomLifecycleCallback = <T extends Component<any, any>>(
	stage: DomLifecycleState,
	cx: ComponentContext<T>,
	result: any | Promise<any>
) => void;

export type DomImpl = [
	document: DomDocument,
	Node: DomNodeClass,
	new_Text: (text?: string | number) => DomTextNode,
	new_Comment: (text?: string | number) => DomCommentNode,
	gencssuid: DomCssUidGenerator,
	isAdopted: DomIsAdopted,
	lifecycle: DomLifecycleCallback,
	component?: DomComponentCallback,
];

let defaultDom: DomImpl = [
	globalThis.document,
	globalThis.Node,
	(text) => new Text(text as string),
	(text) => new Comment(text as string),
	// js-valid but selector-invalid chars can make it into init.name
	(init) => init.name.replaceAll(/[^\w-]/g, "_") + "-" + genuid(),
	() => false,
	() => {},
];
export let getDom: () => DomImpl = () => defaultDom;

export let setDomImpl = (impl: () => DomImpl) => {
	getDom = impl;
};
