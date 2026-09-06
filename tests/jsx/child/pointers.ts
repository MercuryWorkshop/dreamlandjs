import { CommentClass, jsxTest, shape, TextClass } from "../harness.ts";
import { check } from "../../harness.ts";
import { createState, jsx } from "../../../dist/core.js";

// both dom impls report a detached node's parent, but with different absent values
let detached = (n: any) => n.parentNode == null;

// --- pointer region shape ------------------------------------------------------

jsxTest("basic", () => {
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

	check("8 child elements created").assertEq(dom.childNodes.length, 8);

	function checkSet(
		el: string,
		i: number,
		fn: (str: string, node: Node) => void
	) {
		check(`\`${el}\` pointer child has an anchor${after}`).assertInstance(
			dom.childNodes[i * 2],
			CommentClass
		);
		fn(`\`${el}\` pointer child`, dom.childNodes[i * 2 + 1]);
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

	check("8 child elements after rotate").assertEq(dom.childNodes.length, 8);

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

jsxTest("fragments", () => {
	let state = createState({
		x: ["a", "b", "c", "d"],
	});

	let dom = jsx("div", { children: [use(state.x)] });

	check("anchor + 4 children").assertEq(shape(dom), `!,"a","b","c","d"`);

	state.x = ["d", "c", "b", "a"];

	check("5 child elements after rotate").assertEq(dom.childNodes.length, 5);
	["d", "c", "b", "a"].forEach((c, i) => {
		check(`child ${i} has "${c}" text after rotate`).assertEq(
			(dom.childNodes[i + 1] as Text).data,
			c
		);
	});
});

jsxTest("empty-array", () => {
	let state = createState({ x: [] as string[] });
	let dom = jsx("div", { children: [use(state.x)] });

	// an empty array contributes no nodes, so only the anchor is left
	check("empty: just the anchor").assertEq(dom.childNodes.length, 1);
	check("anchor is a Comment").assertInstance(dom.childNodes[0], CommentClass);

	state.x = ["a"];
	check("grow from empty").assertEq(shape(dom), `!,"a"`);

	state.x = [];
	check("shrink back to empty").assertEq(dom.childNodes.length, 1);
});

jsxTest("nested-array", () => {
	let state = createState({ x: ["a", ["b", "c"]] as any });
	let dom = jsx("div", { children: [use(state.x)] });

	// nested arrays flatten and add no markers of their own
	check("anchor + 3 flattened").assertEq(shape(dom), `!,"a","b","c"`);

	state.x = ["x", ["y", "z"]];
	check("still flat after update").assertEq(shape(dom), `!,"x","y","z"`);
});

jsxTest("mixed-static-pointer-order", () => {
	let state = createState({ x: "mid" });
	let dom = jsx("div", { children: ["a", use(state.x), "b"] });

	check("pointer sits between its static siblings").assertEq(
		shape(dom),
		`"a",!,"mid","b"`
	);

	state.x = "MID";
	check("order preserved on update").assertEq(shape(dom), `"a",!,"MID","b"`);
});

// --- node reuse ----------------------------------------------------------------

jsxTest("text-reuse", () => {
	let state = createState({ x: "a" });
	let dom = jsx("div", { children: [use(state.x)] });

	let text = dom.childNodes[1];
	check("anchor + content").assertEq(dom.childNodes.length, 2);
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
	check("still 2 nodes").assertEq(dom.childNodes.length, 2);

	state.x = "c";
	check("text node still reused").assertEq(dom.childNodes[1], text);
	check("data updated again").assertEq((dom.childNodes[1] as Text).data, "c");
});

jsxTest("comment-reuse", () => {
	let state = createState({ x: null as any });
	let dom = jsx("div", { children: [use(state.x)] });

	let comment = dom.childNodes[1];
	check("blacklisted value -> Comment").assertInstance(comment, CommentClass);

	state.x = undefined;
	check("comment reused for undefined").assertEq(dom.childNodes[1], comment);
	state.x = false;
	check("comment reused for false").assertEq(dom.childNodes[1], comment);
	check("still 2 nodes").assertEq(dom.childNodes.length, 2);
});

jsxTest("list-grow-shrink", () => {
	let state = createState({ x: ["a", "b"] as string[] });
	let dom = jsx("div", { children: [use(state.x)] });

	check("3 nodes").assertEq(dom.childNodes.length, 3);
	let ta = dom.childNodes[1];

	state.x = ["a", "b", "c"];
	check("grew").assertEq(shape(dom), `!,"a","b","c"`);
	check("first text reused on grow").assertEq(dom.childNodes[1], ta);

	state.x = ["z"];
	check("shrank").assertEq(shape(dom), `!,"z"`);
	check("surviving text reused on shrink").assertEq(dom.childNodes[1], ta);
});

jsxTest("mixed-array", () => {
	let span = jsx("span", {});
	let state = createState({ x: ["a", null, span] as any[] });
	let dom = jsx("div", { children: [use(state.x)] });

	check("shape").assertEq(shape(dom), `!,"a",!,<span>`);
	let text = dom.childNodes[1];
	let comment = dom.childNodes[2];

	state.x = ["b", null, span];
	check("text reused across mixed update").assertEq(dom.childNodes[1], text);
	check("text retargeted").assertEq((dom.childNodes[1] as Text).data, "b");
	check("comment reused").assertEq(dom.childNodes[2], comment);
	check("node still identical").assertEq(dom.childNodes[3], span);
});

jsxTest("scalar-array-transitions", () => {
	let state = createState({ x: "a" as any });
	let dom = jsx("div", { children: [use(state.x)] });

	check("scalar").assertEq(shape(dom), `!,"a"`);

	state.x = ["a", "b", "c"];
	check("scalar -> array").assertEq(shape(dom), `!,"a","b","c"`);

	state.x = "z";
	check("array -> scalar").assertEq(shape(dom), `!,"z"`);
});

jsxTest("node-value", () => {
	let s1 = jsx("span", {});
	let s2 = jsx("section", {});
	let state = createState({ el: s1 as any });
	let dom = jsx("div", { children: [use(state.el)] });

	check("element value rendered").assertEq(shape(dom), `!,<span>`);

	state.el = s2;
	check("swapped to other element").assertEq(shape(dom), `!,<section>`);
	// the Node branch mutates state.node in place; if `old` is flattened after
	// the map rather than before, the replaced element is never detached
	check("replaced element is detached").assertEq(detached(s1), true);

	state.el = "text";
	check("element -> text").assertEq(shape(dom), `!,"text"`);
	check("second element detached too").assertEq(detached(s2), true);
});

// --- nested pointers -----------------------------------------------------------

jsxTest("pointer-in-array", () => {
	let inner = createState({ v: "1" });
	let state = createState({ x: ["a", use(inner.v)] as any[] });
	let dom = jsx("div", { children: [use(state.x)] });

	check("outer anchor, text, inner anchor, text").assertEq(
		shape(dom),
		`!,"a",!,"1"`
	);
	let innerText = dom.childNodes[3];

	// the pointer element updates independently and in place
	inner.v = "2";
	check("nested pointer text reused").assertEq(dom.childNodes[3], innerText);
	check("nested pointer updated").assertEq(
		(dom.childNodes[3] as Text).data,
		"2"
	);
	check("structure unchanged").assertEq(dom.childNodes.length, 4);
});

jsxTest("pointer-of-pointer", () => {
	let inner = createState({ v: "1" });
	let outer = createState({ x: use(inner.v) as any });
	let dom = jsx("div", { children: [use(outer.x)] });

	check("two anchors + text").assertEq(shape(dom), `!,!,"1"`);

	inner.v = "2";
	check("innermost update in place").assertEq(shape(dom), `!,!,"2"`);
});

jsxTest("nested", () => {
	let inner = createState({ y: "1" });
	let outer = createState({ show: true as boolean });

	let dom = jsx("div", {
		children: [use(outer.show).map((s) => (s ? use(inner.y) : "off"))],
	});

	check("outer anchor, inner anchor, text").assertEq(shape(dom), `!,!,"1"`);
	let text = dom.childNodes[2];

	// updating the inner pointer must update only the inner region, in place
	inner.y = "2";
	check("nested text reused on inner update").assertEq(dom.childNodes[2], text);
	check("nested data updated").assertEq((dom.childNodes[2] as Text).data, "2");
	check("structure unchanged on inner update").assertEq(shape(dom), `!,!,"2"`);

	// collapsing the outer pointer drops the inner region's anchor but adopts
	// its content node rather than allocating a new one
	outer.show = false;
	check("collapsed to anchor + text").assertEq(shape(dom), `!,"off"`);
	check("inner text node reused on collapse").assertEq(dom.childNodes[1], text);

	// a stale update to the now-detached inner pointer must be a no-op
	inner.y = "3";
	check("stale inner update does not resurrect content").assertEq(
		shape(dom),
		`!,"off"`
	);
	check("collapsed content still off").assertEq(
		(dom.childNodes[1] as Text).data,
		"off"
	);
});

jsxTest("entering-a-region-reuses-last", () => {
	let inner = createState({ y: "1" });
	let outer = createState({ show: false as boolean });

	let dom = jsx("div", {
		children: [use(outer.show).map((s) => (s ? use(inner.y) : "off"))],
	});

	check("collapsed initially").assertEq(shape(dom), `!,"off"`);
	let text = dom.childNodes[1];

	// the new region is seeded with the existing state, so the text node
	// survives the transition into the pointer
	outer.show = true;
	check("expanded").assertEq(shape(dom), `!,!,"1"`);
	check("text node reused entering the region").assertEq(
		dom.childNodes[2],
		text
	);
});

jsxTest("identity-skips-rebuild", () => {
	let inner = createState({ v: "x" });
	let ptr = use(inner.v);
	let state = createState({ x: ["a", ptr] as any[] });
	let dom = jsx("div", { children: [use(state.x)] });

	check("initial shape").assertEq(shape(dom), `!,"a",!,"x"`);
	let anchor = dom.childNodes[2];
	let text = dom.childNodes[3];

	// a new array holding the *same* pointer object must reuse the region
	// wholesale rather than resubscribing -- Pointer.listen only ever pushes
	state.x = ["a", ptr];
	check("shape unchanged").assertEq(shape(dom), `!,"a",!,"x"`);
	check("region anchor untouched").assertEq(dom.childNodes[2], anchor);
	check("region content untouched").assertEq(dom.childNodes[3], text);

	inner.v = "y";
	check("region still live and singly driven").assertEq(
		shape(dom),
		`!,"a",!,"y"`
	);
});

jsxTest("region-dropped-from-array", () => {
	let inner = createState({ v: "x" });
	let state = createState({ x: ["a", use(inner.v)] as any[] });
	let dom = jsx("div", { children: [use(state.x)] });

	check("initial shape").assertEq(shape(dom), `!,"a",!,"x"`);

	state.x = ["a"];
	check("region content and anchor both removed").assertEq(shape(dom), `!,"a"`);

	inner.v = "z";
	check("dropped region stays dead").assertEq(shape(dom), `!,"a"`);
});
