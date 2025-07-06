export let DOCUMENT = globalThis.document;
export let new_Text = (text?: string) => new Text(text);
export let new_Comment = (text?: string) => new Comment(text);
export let node: () => typeof Node = () => proto(proto(proto(DOCUMENT)));

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

let proto = (x: any) => x.__proto__;
