import { GLOBAL } from "../consts";

export let DOCUMENT = GLOBAL.document;
export let new_Text = (text?: string) => new Text(text);
export let new_Comment = (text?: string) => new Comment(text);
export let node: () => typeof Node = () => GLOBAL.Node;

export let setDomImpl = (
	doc: any,
	text: (text?: string) => any,
	comment: (text?: string) => any,
	Node: () => any
) => {
	DOCUMENT = doc;
	new_Text = text;
	new_Comment = comment;
	node = Node;
};
