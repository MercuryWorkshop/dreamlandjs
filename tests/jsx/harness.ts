import { test } from "../harness.ts";
import type { TestFunction } from "../harness.ts";
import { setDomImpl, domImpl } from "../../dist/core.js";
import type { DomImpl } from "../../dist/core.js";
import { __unstable_newVdom } from "../../dist/ssr.server.js";
import { Window } from "happy-dom";

type Dom = [dom: DomImpl, node: any, comment: any, text: any];

export let NodeClass: any;
export let TextClass: any;
export let CommentClass: any;

function createHappyDom(): Dom {
	let window = new Window();
	return [
		[
			window.document,
			window.Node,
			(text) => new window.Text(text),
			(text) => new window.Comment(text),
			(init) => init.name + "-" + window.crypto.randomUUID(),
			() => false,
		],
		window.Node,
		window.Comment,
		window.Text,
	];
}
function createSsrVdom(): Dom {
	let dom = __unstable_newVdom();
	return [dom, dom[0].Node, dom[0].Comment, dom[0].Text];
}

async function runTest([dom, node, comment, text]: Dom, fn: TestFunction) {
	let old = domImpl;

	setDomImpl(() => dom);
	NodeClass = node;
	CommentClass = comment;
	TextClass = text;

	let ret = await fn();

	setDomImpl(old);
	NodeClass = undefined!;
	CommentClass = undefined!;
	TextClass = undefined!;

	return ret;
}

export let jsxTest: typeof test = (name, fn) => {
	test(name, () => runTest(createSsrVdom(), fn), "dlssr-dom");
	test(name, () => runTest(createHappyDom(), fn), "happy-dom");
};

// A pointer child renders as a single leading anchor comment followed by its
// content; there is no closing marker. Arrays contribute no nodes of their own,
// so `<div>{use(x)}</div>` with a scalar is 2 nodes and with a 3-element array
// is 4, at any nesting depth.
export let shape = (el: Node) =>
	[...el.childNodes]
		.map((n: any) =>
			n.nodeType === 3
				? JSON.stringify(n.data)
				: n.nodeType === 8
					? "!"
					: // happy-dom exposes nodeName, the ssr vdom exposes `type`
						"<" + (n.nodeName || n.type).toLowerCase() + ">"
		)
		.join(",");

// the css ident and the component marker live in attributes, so classList holds
// only what `class` / `class:` put there
export let ownClasses = (el: any) => [...el.classList].sort().join(" ");
