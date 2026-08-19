import { CommentClass, jsxTest, NodeClass, TextClass } from "../harness.ts";
import { check } from "../../harness.ts";
import { jsx } from "../../../dist/core.js";

jsxTest("basic", () => {
	let dom = jsx("div", {
		children: ["abc", 0, null, undefined],
	});

	check("4 child elements created").assertEq(dom.childNodes.length, 4);
	check(`"abc" child is Text`).assertInstance(dom.childNodes[0], TextClass);
	check(`"abc" child element has "abc" text`).assertEq(
		(dom.childNodes[0] as Text).data,
		"abc"
	);
	check("second child is Text").assertInstance(dom.childNodes[1], TextClass);
	check('`0` child element has "0" text').assertEq(
		(dom.childNodes[1] as Text).data,
		"0"
	);
	check("`null` child is Comment").assertInstance(
		dom.childNodes[2],
		CommentClass
	);
	check("`undefined` child is Comment").assertInstance(
		dom.childNodes[3],
		CommentClass
	);
});

jsxTest("no-children-renders-nothing", () => {
	// an absent children prop must not produce a placeholder comment
	check("element with no children prop is empty").assertEq(
		jsx("span", {}).childNodes.length,
		0
	);
	check("empty children array is empty").assertEq(
		jsx("span", { children: [] }).childNodes.length,
		0
	);
});

jsxTest("fragments/nested", () => {
	let dom = jsx("div", {
		children: ["a", ["b", ["c", ["d"]]]],
	});

	check("4 child elements created").assertEq(dom.childNodes.length, 4);
	["a", "b", "c", "d"].forEach((c, i) => {
		check(`"${c}" child is Text`).assertInstance(dom.childNodes[i], TextClass);
		check(`"${c}" child has "${c}" text`).assertEq(
			(dom.childNodes[i] as Text).data,
			c
		);
	});
});

jsxTest("blacklist-and-falsy", () => {
	// false/true render as comments; 0 and "" are falsy but NOT blacklisted
	let dom = jsx("div", { children: [false, true, 0, ""] });

	check("4 children").assertEq(dom.childNodes.length, 4);
	check("`false` -> Comment").assertInstance(dom.childNodes[0], CommentClass);
	check("`true` -> Comment").assertInstance(dom.childNodes[1], CommentClass);
	check("`0` -> Text").assertInstance(dom.childNodes[2], TextClass);
	check('`0` text is "0"').assertEq((dom.childNodes[2] as Text).data, "0");
	check('`""` -> Text').assertInstance(dom.childNodes[3], TextClass);
	check('`""` text is empty').assertEq((dom.childNodes[3] as Text).data, "");
});

jsxTest("static-element-child", () => {
	// a plain element child is appended as-is, with no comment wrappers
	let span = jsx("span", {});
	let dom = jsx("div", { children: ["before", span, "after"] });

	check("3 children, no wrappers").assertEq(dom.childNodes.length, 3);
	check("text before").assertEq((dom.childNodes[0] as Text).data, "before");
	check("element child is the same node").assertEq(dom.childNodes[1], span);
	check("element child is a Node").assertInstance(dom.childNodes[1], NodeClass);
	check("text after").assertEq((dom.childNodes[2] as Text).data, "after");
});
