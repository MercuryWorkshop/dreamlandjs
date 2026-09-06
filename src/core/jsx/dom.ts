import { genuid } from "../css";
import { Component, ComponentContext, ComponentState } from "./definitions";

export let CREATE_ELEMENT = "createElement" as const;

export const enum DomLifecycleState {
	Load = 1,
	Init = 2,
	Mount = 3,
}

export type DomNodeConstructor = (text?: string) => any;
export type DomCssUidGenerator = (
	init: Component<any, any>,
	style: HTMLStyleElement
) => string;
export type DomIsAdopted = (el: HTMLElement) => boolean;
export type DomComponentCallback = <T extends Component<any, any>>(
	init: T,
	state: ComponentState<T>,
	cx?: ComponentContext<T>
) => void;
export type DomLifecycleCallback = <T extends Component<any, any>>(
	state: DomLifecycleState,
	cx: ComponentContext<T>,
	result: any | Promise<any>
) => void;

export type DomImpl = [
	document: any,
	Node: any,
	new_Text: DomNodeConstructor,
	new_Comment: DomNodeConstructor,
	gencssuid: DomCssUidGenerator,
	isAdopted: DomIsAdopted,
	lifecycle: DomLifecycleCallback,
	component?: DomComponentCallback,
];

let defaultDom: DomImpl = [
	globalThis.document,
	globalThis.Node,
	(text) => new Text(text),
	(text) => new Comment(text),
	// js-valid but selector-invalid chars can make it into init.name
	(init) => init.name.replaceAll(/[^\w-]/g, "_") + "-" + genuid(),
	() => false,
	() => {},
];
export let getDom: () => DomImpl = () => defaultDom;

export let setDomImpl = (impl: () => DomImpl) => {
	getDom = impl;
};
