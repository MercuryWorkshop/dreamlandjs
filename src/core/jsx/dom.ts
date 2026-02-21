import { genuid } from "../css";
import { Component, ComponentContext } from "./definitions";

export let CSS_IDENT = "dlcss-";

type NodeConstructor = (text?: string) => any;
type CssUidGenerator = () => string;
type IsHydrating = ((el: HTMLElement) => boolean) | undefined;
type SsrTransformCallback =
	| (<T extends Component<any, any>>(init: T, cx?: ComponentContext<T>) => void)
	| undefined;

export let DOCUMENT = globalThis.document;
export let node: typeof Node = globalThis.Node;
export let new_Text: NodeConstructor = (text) => new Text(text);
export let new_Comment: NodeConstructor = (text) => new Comment(text);
export let genCssUid: CssUidGenerator = () => CSS_IDENT + genuid();
export let hydrating: IsHydrating = () => false;
export let ssrTransform: SsrTransformCallback;

export type DomImpl = [
	any,
	any,
	NodeConstructor,
	NodeConstructor,
	CssUidGenerator,
	IsHydrating,
	SsrTransformCallback,
];

export let setDomImpl: (impl: DomImpl) => void = (impl: DomImpl) =>
	([DOCUMENT, node, new_Text, new_Comment, genCssUid, hydrating, ssrTransform] =
		impl);
export let getDomImpl = (): DomImpl => [
	DOCUMENT,
	node,
	new_Text,
	new_Comment,
	genCssUid,
	hydrating,
	ssrTransform,
];
