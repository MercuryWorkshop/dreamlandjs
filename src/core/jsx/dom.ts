import { Component, ComponentContext } from "./definitions";
import { GLOBAL } from "../consts";
import { genuid } from "../css";

export let CSS_IDENT = "dlcss-";

export let DOCUMENT = GLOBAL.document;
export let node: typeof Node = GLOBAL.Node;
export let new_Text = (text?: string) => new Text(text);
export let new_Comment = (text?: string) => new Comment(text);
export let genCssUid = () => CSS_IDENT + genuid();
export let ssrTransform: (init: Function, cx?: ComponentContext<any>) => void =
	((_: any) => {}) as any;

export type DomImpl = [
	any,
	any,
	(text?: string) => any,
	(text?: string) => any,
	() => string,
	(init: Component<any, any, any>, cx?: ComponentContext<any>) => void,
];

export let setDomImpl = (dom: DomImpl) => {
	DOCUMENT = dom[0];
	node = dom[1];
	new_Text = dom[2];
	new_Comment = dom[3];
	genCssUid = dom[4];
	ssrTransform = dom[5];
};
export let getDomImpl = (): DomImpl => [
	DOCUMENT,
	node,
	new_Text,
	new_Comment,
	genCssUid,
	ssrTransform,
];
