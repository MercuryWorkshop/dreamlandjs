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
	let componentCssInfo = new Map();
	let window = new Window();
	return [
		[
			window.document,
			window.Node,
			(text) => new window.Text(text),
			(text) => new window.Comment(text),
			(init) => init.name + "-" + window.crypto.randomUUID(),
			componentCssInfo,
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
