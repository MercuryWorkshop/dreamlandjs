import { GLOBAL } from "../consts";
import { genuid } from "../css";
import { Component, ComponentContext } from "./definitions";

export let CSS_IDENT = "dlcss-";

export let DOCUMENT = GLOBAL.document;
export let node: typeof Node = GLOBAL.Node;
export let new_Text = (text?: string) => new Text(text);
export let new_Comment = (text?: string) => new Comment(text);
export let genCssUid = () => CSS_IDENT + genuid();
export let hydrating: (el: HTMLElement) => boolean | undefined = () => false;
export let ssrTransform:
	| ((init: Component<any, any, any>, cx?: ComponentContext<any>) => void)
	| undefined;

export type DomImpl = [
	any,
	any,
	(text?: string) => any,
	(text?: string) => any,
	() => string,
	((el: HTMLElement) => boolean) | undefined,
	(
		| ((init: Component<any, any, any>, cx?: ComponentContext<any>) => void)
		| undefined
	),
];

export let setDomImpl = ([
	Doc,
	Node,
	New_Text,
	New_Comment,
	GenCssUid,
	Hydrating,
	SsrTransform,
]: DomImpl) => {
	DOCUMENT = Doc;
	node = Node;
	new_Text = New_Text;
	new_Comment = New_Comment;
	genCssUid = GenCssUid;
	hydrating = Hydrating;
	ssrTransform = SsrTransform;
};
export let getDomImpl = (): DomImpl => [
	DOCUMENT,
	node,
	new_Text,
	new_Comment,
	genCssUid,
	hydrating,
	ssrTransform,
];
