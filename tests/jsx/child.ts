import { CommentClass, jsxTest, NodeClass, TextClass } from "./harness.ts";
import { check } from "../harness.ts";
import { createState, css, jsx } from "dreamland/core";

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

jsxTest("pointers/basic", () => {
	let state = createState({
		a: "abc" as any,
		b: 0 as any,
		c: null as any,
		d: undefined as any,
	});

	let dom = jsx("div", {
		children: [use(state.a), use(state.b), use(state.c), use(state.d)],
	});

	let after = "";

	check("12 child elements created").assertEq(dom.childNodes.length, 12);

	function checkSet(
		el: string,
		i: number,
		fn: (str: string, node: Node) => void
	) {
		check(
			`\`${el}\` pointer child has beginning comment wrapper${after}`
		).assertInstance(dom.childNodes[i * 3], CommentClass);
		fn(`\`${el}\` pointer child`, dom.childNodes[i * 3 + 1]);
		check(
			`\`${el}\` pointer child has ending comment wrapper${after}`
		).assertInstance(dom.childNodes[i * 3 + 2], CommentClass);
	}

	checkSet("a", 0, (child, node) => {
		check(`${child} is Text`).assertInstance(node, TextClass);
		check(`${child} element has "abc" text`).assertEq(
			(node as Text).data,
			"abc"
		);
	});
	checkSet("b", 1, (child, node) => {
		check(`${child} is Text`).assertInstance(node, TextClass);
		check(`${child} element has "0" text`).assertEq((node as Text).data, "0");
	});
	checkSet("c", 2, (child, node) => {
		check(`${child} is Comment`).assertInstance(node, CommentClass);
	});
	checkSet("d", 3, (child, node) => {
		check(`${child} is Comment`).assertInstance(node, CommentClass);
	});

	state.a = null;
	state.b = undefined;
	state.c = "abc";
	state.d = 0;

	after = " after rotate";

	check("12 child elements after rotate").assertEq(dom.childNodes.length, 12);

	checkSet("a", 0, (child, node) => {
		check(`${child} is Comment`).assertInstance(node, CommentClass);
	});
	checkSet("b", 1, (child, node) => {
		check(`${child} is Comment`).assertInstance(node, CommentClass);
	});
	checkSet("c", 2, (child, node) => {
		check(`${child} is Text`).assertInstance(node, TextClass);
		check(`${child} element has "abc" text`).assertEq(
			(node as Text).data,
			"abc"
		);
	});
	checkSet("d", 3, (child, node) => {
		check(`${child} is Text`).assertInstance(node, TextClass);
		check(`${child} element has "0" text`).assertEq((node as Text).data, "0");
	});
});

jsxTest("pointers/fragments", () => {
	let state = createState({
		x: ["a", "b", "c", "d"],
	});

	let dom = jsx("div", {
		children: [use(state.x)],
	});

	check("6 child elements created").assertEq(dom.childNodes.length, 6);
	check(`\`x\` pointer child has beginning comment wrapper`).assertInstance(
		dom.childNodes[0],
		CommentClass
	);
	["a", "b", "c", "d"].forEach((c, i) => {
		check(`"${c}" child is Text`).assertInstance(
			dom.childNodes[i + 1],
			TextClass
		);
		check(`"${c}" child has "${c}" text`).assertEq(
			(dom.childNodes[i + 1] as Text).data,
			c
		);
	});
	check(`\`x\` pointer child has ending comment wrapper`).assertInstance(
		dom.childNodes[5],
		CommentClass
	);

	state.x = ["d", "c", "b", "a"];

	check("6 child elements after rotate").assertEq(dom.childNodes.length, 6);
	["d", "c", "b", "a"].forEach((c, i) => {
		check(`child ${i} has "${c}" text after rotate`).assertEq(
			(dom.childNodes[i + 1] as Text).data,
			c
		);
	});
});

// --- behaviors the rewrite is meant to guarantee -------------------------------

jsxTest("pointers/text-reuse", () => {
	let state = createState({ x: "a" });
	let dom = jsx("div", { children: [use(state.x)] });

	let text = dom.childNodes[1];
	check("3 nodes (wrappers + content)").assertEq(dom.childNodes.length, 3);
	check("content is Text").assertInstance(text, TextClass);
	check("initial data").assertEq((text as Text).data, "a");

	state.x = "b";
	check("same text node is reused, not recreated").assertEq(
		dom.childNodes[1],
		text
	);
	check("data updated in place").assertEq(
		(dom.childNodes[1] as Text).data,
		"b"
	);
	check("still 3 nodes").assertEq(dom.childNodes.length, 3);

	state.x = "c";
	check("text node still reused").assertEq(dom.childNodes[1], text);
	check("data updated again").assertEq((dom.childNodes[1] as Text).data, "c");
});

jsxTest("pointers/nested", () => {
	let inner = createState({ y: "1" });
	let outer = createState({ show: true as boolean });

	let dom = jsx("div", {
		children: [use(outer.show).map((s) => (s ? use(inner.y) : "off"))],
	});

	// outer-start, inner-start, text, inner-end, outer-end
	check("5 nodes when nested pointer is active").assertEq(
		dom.childNodes.length,
		5
	);
	let text = dom.childNodes[2];
	check("nested content is Text").assertInstance(text, TextClass);
	check("nested initial data").assertEq((text as Text).data, "1");

	// updating the inner pointer must update only the inner region, in place
	inner.y = "2";
	check("nested text reused on inner update").assertEq(dom.childNodes[2], text);
	check("nested data updated").assertEq((dom.childNodes[2] as Text).data, "2");
	check("structure unchanged on inner update").assertEq(
		dom.childNodes.length,
		5
	);

	// collapsing the outer pointer rebuilds the region into a single text node
	outer.show = false;
	check("3 nodes after outer collapses").assertEq(dom.childNodes.length, 3);
	check('collapsed content is "off"').assertEq(
		(dom.childNodes[1] as Text).data,
		"off"
	);

	// a stale update to the now-detached inner pointer must be a no-op
	inner.y = "3";
	check("stale inner update does not resurrect content").assertEq(
		dom.childNodes.length,
		3
	);
	check("collapsed content still off").assertEq(
		(dom.childNodes[1] as Text).data,
		"off"
	);
});

jsxTest("pointers/list-reorder", () => {
	let a = jsx("span", {});
	let b = jsx("span", {});
	let c = jsx("span", {});
	let state = createState({ items: [a, b, c] as any[] });

	let dom = jsx("div", { children: [use(state.items)] });

	check("5 nodes").assertEq(dom.childNodes.length, 5);
	check("a @ 1").assertEq(dom.childNodes[1], a);
	check("b @ 2").assertEq(dom.childNodes[2], b);
	check("c @ 3").assertEq(dom.childNodes[3], c);

	state.items = [c, a, b];

	check("5 nodes after reorder").assertEq(dom.childNodes.length, 5);
	check("c moved to 1 (same node)").assertEq(dom.childNodes[1], c);
	check("a moved to 2 (same node)").assertEq(dom.childNodes[2], a);
	check("b moved to 3 (same node)").assertEq(dom.childNodes[3], b);
});

jsxTest("pointers/list-grow-shrink", () => {
	let state = createState({ x: ["a", "b"] as string[] });
	let dom = jsx("div", { children: [use(state.x)] });

	check("4 nodes").assertEq(dom.childNodes.length, 4);
	let ta = dom.childNodes[1];

	state.x = ["a", "b", "c"];
	check("5 nodes after grow").assertEq(dom.childNodes.length, 5);
	check("first text reused on grow").assertEq(dom.childNodes[1], ta);
	check("appended text is c").assertEq((dom.childNodes[3] as Text).data, "c");

	state.x = ["z"];
	check("3 nodes after shrink").assertEq(dom.childNodes.length, 3);
	check("surviving text reused on shrink").assertEq(dom.childNodes[1], ta);
	check("surviving text retargeted to z").assertEq(
		(dom.childNodes[1] as Text).data,
		"z"
	);
});

// --- remaining static / build-path coverage -----------------------------------

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

// --- _jsx append ordering ------------------------------------------------------

jsxTest("mixed-static-pointer-order", () => {
	let state = createState({ x: "mid" });
	let dom = jsx("div", { children: ["a", use(state.x), "b"] });

	// text("a"), [ , text("mid"), ], text("b")
	check("5 nodes").assertEq(dom.childNodes.length, 5);
	check("static a first").assertEq((dom.childNodes[0] as Text).data, "a");
	check("pointer start wrapper").assertInstance(
		dom.childNodes[1],
		CommentClass
	);
	check("pointer content between siblings").assertEq(
		(dom.childNodes[2] as Text).data,
		"mid"
	);
	check("pointer end wrapper").assertInstance(dom.childNodes[3], CommentClass);
	check("static b last").assertEq((dom.childNodes[4] as Text).data, "b");

	// updating the pointer keeps the static siblings put
	state.x = "MID";
	check("order preserved on update").assertEq(dom.childNodes.length, 5);
	check("a still first").assertEq((dom.childNodes[0] as Text).data, "a");
	check("content updated in place").assertEq(
		(dom.childNodes[2] as Text).data,
		"MID"
	);
	check("b still last").assertEq((dom.childNodes[4] as Text).data, "b");
});

// --- scalar pointer: Node values & cross-type transitions ----------------------

jsxTest("pointers/node-value", () => {
	let s1 = jsx("span", {});
	let s2 = jsx("section", {});
	let state = createState({ el: s1 as any });
	let dom = jsx("div", { children: [use(state.el)] });

	check("3 nodes").assertEq(dom.childNodes.length, 3);
	check("element value rendered").assertEq(dom.childNodes[1], s1);

	state.el = s2;
	check("swapped to other element").assertEq(dom.childNodes[1], s2);
	check("still 3 nodes").assertEq(dom.childNodes.length, 3);

	state.el = "text";
	check("element -> text").assertInstance(dom.childNodes[1], TextClass);
	check("text content").assertEq((dom.childNodes[1] as Text).data, "text");
});

jsxTest("pointers/scalar-array-transitions", () => {
	let state = createState({ x: "a" as any });
	let dom = jsx("div", { children: [use(state.x)] });

	check("scalar: 3 nodes").assertEq(dom.childNodes.length, 3);

	// scalar -> array
	state.x = ["a", "b", "c"];
	check("array: 5 nodes").assertEq(dom.childNodes.length, 5);
	check("array data a/b/c").assertEq(
		[1, 2, 3].map((i) => (dom.childNodes[i] as Text).data).join(""),
		"abc"
	);

	// array -> scalar
	state.x = "z";
	check("scalar again: 3 nodes").assertEq(dom.childNodes.length, 3);
	check("scalar content z").assertEq((dom.childNodes[1] as Text).data, "z");
});

// --- list reconcile: mixed types, comment reuse, nested & pointer elements -----

jsxTest("pointers/mixed-array", () => {
	let span = jsx("span", {});
	let state = createState({ x: ["a", null, span] as any[] });
	let dom = jsx("div", { children: [use(state.x)] });

	// [ , text("a"), comment, span, ]
	check("5 nodes").assertEq(dom.childNodes.length, 5);
	let text = dom.childNodes[1];
	let comment = dom.childNodes[2];
	check("text element").assertInstance(text, TextClass);
	check("blacklist element -> comment").assertInstance(comment, CommentClass);
	check("node element").assertEq(dom.childNodes[3], span);

	state.x = ["b", null, span];
	check("text reused across mixed update").assertEq(dom.childNodes[1], text);
	check("text retargeted").assertEq((dom.childNodes[1] as Text).data, "b");
	check("comment reused").assertEq(dom.childNodes[2], comment);
	check("node still identical").assertEq(dom.childNodes[3], span);
});

jsxTest("pointers/nested-array", () => {
	let state = createState({ x: ["a", ["b", "c"]] as any });
	let dom = jsx("div", { children: [use(state.x)] });

	// nested arrays flatten: [ , a, b, c, ]
	check("5 nodes (flattened)").assertEq(dom.childNodes.length, 5);
	check("flattened a/b/c").assertEq(
		[1, 2, 3].map((i) => (dom.childNodes[i] as Text).data).join(""),
		"abc"
	);

	state.x = ["x", ["y", "z"]];
	check("still 5 nodes after flattened update").assertEq(
		dom.childNodes.length,
		5
	);
	check("flattened x/y/z").assertEq(
		[1, 2, 3].map((i) => (dom.childNodes[i] as Text).data).join(""),
		"xyz"
	);
});

jsxTest("pointers/pointer-in-array", () => {
	let inner = createState({ v: "1" });
	let state = createState({ x: ["a", use(inner.v)] as any[] });
	let dom = jsx("div", { children: [use(state.x)] });

	// outer-start, text("a"), inner-start, text("1"), inner-end, outer-end
	check("6 nodes").assertEq(dom.childNodes.length, 6);
	let innerText = dom.childNodes[3];
	check("array text").assertEq((dom.childNodes[1] as Text).data, "a");
	check("nested pointer content").assertEq((innerText as Text).data, "1");

	// the pointer element updates independently and in place
	inner.v = "2";
	check("nested pointer text reused").assertEq(dom.childNodes[3], innerText);
	check("nested pointer updated").assertEq(
		(dom.childNodes[3] as Text).data,
		"2"
	);
	check("structure unchanged").assertEq(dom.childNodes.length, 6);
});

jsxTest("pointers/empty-array", () => {
	let state = createState({ x: [] as string[] });
	let dom = jsx("div", { children: [use(state.x)] });

	// just the wrappers
	check("empty: 2 nodes").assertEq(dom.childNodes.length, 2);
	check("start wrapper").assertInstance(dom.childNodes[0], CommentClass);
	check("end wrapper").assertInstance(dom.childNodes[1], CommentClass);

	state.x = ["a"];
	check("grow from empty: 3 nodes").assertEq(dom.childNodes.length, 3);
	check("grown content").assertEq((dom.childNodes[1] as Text).data, "a");

	state.x = [];
	check("shrink to empty: 2 nodes").assertEq(dom.childNodes.length, 2);
});

// --- css ident application to children -----------------------------------------

jsxTest("css/ident-on-children", () => {
	let Styled = function (this: any) {
		return jsx("div", { children: this.children });
	} as any;
	Styled.style = css`
		color: red;
	`;

	// created in plain scope, so neither carries a css ident yet; the grandchild
	// exercises applyCss's recursion into descendant elements
	let grandchild = jsx("b", {});
	let orphan = jsx("section", { children: [grandchild] });
	let dom = jsx(Styled, { children: [orphan] });

	let hasIdent = (el: any) =>
		[...el.classList].some((c: string) => c.startsWith("dlcss-"));

	check("component root marked").assertEq(
		[...(dom as any).classList].includes("dlc"),
		true
	);
	check("child element inherits the component's css ident").assertEq(
		hasIdent(orphan),
		true
	);
	check("descendant element inherits it too (recursion)").assertEq(
		hasIdent(grandchild),
		true
	);
});

jsxTest("css/skips-nested-component", () => {
	// a styled child component's subtree must NOT be re-stamped by the parent's
	// ident — applyCss bails on any element carrying the component marker class
	let Child = function (this: any) {
		return jsx("span", {});
	} as any;
	Child.style = css`
		color: blue;
	`;
	let Parent = function (this: any) {
		return jsx("div", { children: [jsx(Child, {})] });
	} as any;
	Parent.style = css`
		color: red;
	`;

	let dom = jsx(Parent, {});
	let parentIdent = [...(dom as any).classList].find((c: string) =>
		c.startsWith("dlcss-")
	);
	let childRoot = dom.childNodes[0] as any;

	check("nested component root is a component").assertEq(
		[...childRoot.classList].includes("dlc"),
		true
	);
	check("parent ident exists").assertEq(!!parentIdent, true);
	check("nested component is NOT re-stamped with the parent ident").assertEq(
		[...childRoot.classList].includes(parentIdent),
		false
	);
});
