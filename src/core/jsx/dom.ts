import { GLOBAL } from "../consts";
import { genuid } from "../css";
import { Component, ComponentContext } from "./definitions";

export let CSS_IDENT = "dlcss-";

type NodeConstructor = (text?: string) => any;
type CssUidGenerator = () => string;
type IsHydrating = ((el: HTMLElement) => boolean) | undefined;
type SsrTransformCallback =
	| (<T extends Component<any, any>>(init: T, cx?: ComponentContext<T>) => void)
	| undefined;

export let DOCUMENT = GLOBAL.document;
export let node: typeof Node = GLOBAL.Node;
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
