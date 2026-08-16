import { genuid } from "../css";
import { Component, ComponentContext, ComponentState } from "./definitions";

export let CREATE_ELEMENT = "createElement" as const;

type NodeConstructor = (text?: string) => any;
type CssUidGenerator = (
	init: Component<any, any>,
	style: HTMLStyleElement
) => string;
type IsHydrating = (el: HTMLElement) => boolean;
type SsrTransformCallback = <T extends Component<any, any>>(
	init: T,
	state: ComponentState<T>,
	cx?: ComponentContext<T>
) => void;
type CxList = ComponentContext<Component<any, any>>[];
type CbRetList = (Promise<any> | any)[];

export type DomImpl = [
	document: any,
	Node: any,
	new_Text: NodeConstructor,
	new_Comment: NodeConstructor,
	gencssuid: CssUidGenerator,
	hydrating?: IsHydrating,
	ssrTransform?: SsrTransformCallback,
	cxs?: CxList,
	inits?: CbRetList,
	mounts?: CbRetList,
];

let defaultDom: DomImpl = [
	globalThis.document,
	globalThis.Node,
	(text) => new Text(text),
	(text) => new Comment(text),
	// js-valid but selector-invalid chars can make it into init.name
	(init) => init.name.replaceAll(/[^\w-]/g, "_") + "-" + genuid(),
	() => false,
];
export let getDom: () => DomImpl = () => defaultDom;

export let setDomImpl = (impl: () => DomImpl) => {
	getDom = impl;
};
