import { CommentClass, jsxTest, NodeClass, TextClass } from "./harness.ts";
import { check } from "../harness.ts";
import { createState, css, jsx } from "../../dist/core.js";

// A pointer child renders as a single leading anchor comment followed by its
// content; there is no closing marker. Arrays contribute no nodes of their own,
// so `<div>{use(x)}</div>` with a scalar is 2 nodes and with a 3-element array
// is 4, at any nesting depth.
let shape = (el: Node) =>
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

// both dom impls report a detached node's parent, but with different absent values
let detached = (n: any) => n.parentNode == null;

// counts the DOM mutations the reconciler issues on a specific parent. Needed
// because a broken LIS still produces correct output -- it just reinserts
// everything -- so only op counts can catch it.
let instrument = (el: any) => {
	let counts = { insert: 0, remove: 0 };
	let ib = el.insertBefore.bind(el);
	let rc = el.removeChild.bind(el);
	// the ssr vdom's insertBefore detaches the node first; that internal call
	// isn't a reconciler decision, so don't count it
	let moving = false;
	el.insertBefore = (a: any, b: any) => {
		counts.insert++;
		moving = true;
		try {
			return ib(a, b);
		} finally {
			moving = false;
		}
	};
	el.removeChild = (a: any) => (moving || counts.remove++, rc(a));
	return counts;
};

// --- static children -----------------------------------------------------------

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

// --- pointer region shape ------------------------------------------------------

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

jsxTest("pointers/fragments", () => {
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

jsxTest("pointers/empty-array", () => {
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

jsxTest("pointers/nested-array", () => {
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

jsxTest("pointers/text-reuse", () => {
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

jsxTest("pointers/comment-reuse", () => {
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

jsxTest("pointers/list-grow-shrink", () => {
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

jsxTest("pointers/mixed-array", () => {
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

jsxTest("pointers/scalar-array-transitions", () => {
	let state = createState({ x: "a" as any });
	let dom = jsx("div", { children: [use(state.x)] });

	check("scalar").assertEq(shape(dom), `!,"a"`);

	state.x = ["a", "b", "c"];
	check("scalar -> array").assertEq(shape(dom), `!,"a","b","c"`);

	state.x = "z";
	check("array -> scalar").assertEq(shape(dom), `!,"z"`);
});

jsxTest("pointers/node-value", () => {
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

// --- reconciliation minimality -------------------------------------------------

jsxTest("reconcile/append-is-one-insert", () => {
	let state = createState({ x: ["a", "b", "c"] as string[] });
	let dom = jsx("div", { children: [use(state.x)] });
	let counts = instrument(dom);

	state.x = ["a", "b", "c", "d"];
	check("appended").assertEq(shape(dom), `!,"a","b","c","d"`);
	check("exactly one insert").assertEq(counts.insert, 1);
	check("nothing removed").assertEq(counts.remove, 0);
});

jsxTest("reconcile/unchanged-is-noop", () => {
	let state = createState({ x: ["a", "b", "c"] as string[] });
	let dom = jsx("div", { children: [use(state.x)] });
	let counts = instrument(dom);

	state.x = ["a", "b", "c"]; // new array, identical contents
	check("unchanged").assertEq(shape(dom), `!,"a","b","c"`);
	check("no inserts").assertEq(counts.insert, 0);
	check("no removes").assertEq(counts.remove, 0);
});

jsxTest("reconcile/middle-removal", () => {
	let state = createState({ x: ["a", "b", "c", "d"] as string[] });
	let dom = jsx("div", { children: [use(state.x)] });

	state.x = ["a", "d"];
	check("shape").assertEq(shape(dom), `!,"a","d"`);
});

jsxTest("pointers/list-reorder", () => {
	let a = jsx("span", {});
	let b = jsx("span", {});
	let c = jsx("span", {});
	let state = createState({ items: [a, b, c] as any[] });

	let dom = jsx("div", { children: [use(state.items)] });

	check("4 nodes").assertEq(dom.childNodes.length, 4);
	check("a @ 1").assertEq(dom.childNodes[1], a);
	check("b @ 2").assertEq(dom.childNodes[2], b);
	check("c @ 3").assertEq(dom.childNodes[3], c);

	let counts = instrument(dom);
	state.items = [c, a, b];

	check("4 nodes after reorder").assertEq(dom.childNodes.length, 4);
	check("c moved to 1 (same node)").assertEq(dom.childNodes[1], c);
	check("a moved to 2 (same node)").assertEq(dom.childNodes[2], a);
	check("b moved to 3 (same node)").assertEq(dom.childNodes[3], b);
	// the LIS keeps a and b static; only c should be relocated
	check("only one node moved").assertEq(counts.insert, 1);
	check("nothing removed").assertEq(counts.remove, 0);
});

// --- nested pointers -----------------------------------------------------------

jsxTest("pointers/pointer-in-array", () => {
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

jsxTest("pointers/pointer-of-pointer", () => {
	let inner = createState({ v: "1" });
	let outer = createState({ x: use(inner.v) as any });
	let dom = jsx("div", { children: [use(outer.x)] });

	check("two anchors + text").assertEq(shape(dom), `!,!,"1"`);

	inner.v = "2";
	check("innermost update in place").assertEq(shape(dom), `!,!,"2"`);
});

jsxTest("pointers/nested", () => {
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

jsxTest("pointers/entering-a-region-reuses-last", () => {
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

jsxTest("pointers/identity-skips-rebuild", () => {
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

jsxTest("pointers/region-dropped-from-array", () => {
	let inner = createState({ v: "x" });
	let state = createState({ x: ["a", use(inner.v)] as any[] });
	let dom = jsx("div", { children: [use(state.x)] });

	check("initial shape").assertEq(shape(dom), `!,"a",!,"x"`);

	state.x = ["a"];
	check("region content and anchor both removed").assertEq(shape(dom), `!,"a"`);

	inner.v = "z";
	check("dropped region stays dead").assertEq(shape(dom), `!,"a"`);
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
	// exercises applyIdent's recursion into descendant elements
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
	// ident -- applyIdent bails on any element carrying the component marker class
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

// classes the `class` attr did not put there (the css ident, `class:` toggles)
let ownClasses = (el: any) =>
	[...el.classList]
		.filter((x: string) => !x.startsWith("dlcss-") && x !== "dlc")
		.sort()
		.join(" ");

jsxTest("class/updates-under-a-css-ident", () => {
	// the css ident is stamped after the attr loop and marks classList dirty, so
	// the *first* `class` write goes through the non-dirty path and never splits.
	// the dirty path still has to know what that write left behind, or every
	// later update just piles on top of it
	let state = createState({ c: "a" });
	let Styled = function () {
		return jsx("div", { class: use(state.c) });
	} as any;
	Styled.style = css`
		color: red;
	`;

	let dom: any = jsx(Styled, {});
	check("initial class applied").assertEq(ownClasses(dom), "a");
	state.c = "b";
	check("the previous class is removed, not accumulated").assertEq(
		ownClasses(dom),
		"b"
	);
});

jsxTest("class/coexists-with-toggles", () => {
	// `class` may only ever remove what `class` itself added -- classes owned by
	// `class:` bindings have to survive an unrelated `class` update
	let state = createState({ c: "a", x: true, y: true });
	let dom: any = jsx("div", {
		class: use(state.c),
		"class:x": use(state.x),
		"class:y": use(state.y),
	});
	check("class and both toggles applied").assertEq(ownClasses(dom), "a x y");

	state.c = "b";
	check("toggles survive a class update").assertEq(ownClasses(dom), "b x y");

	state.x = false;
	check("a toggle still turns off").assertEq(ownClasses(dom), "b y");

	state.c = "c";
	check("class update after a toggle change").assertEq(ownClasses(dom), "c y");
});

jsxTest("class/toggle-before-class", () => {
	// attr order is prop order: here classList is already dirty by the time the
	// `class` handler first runs, so it takes the dirty path with nothing to remove
	let state = createState({ c: "a", x: true });
	let dom: any = jsx("div", { "class:x": use(state.x), class: use(state.c) });
	check("both applied").assertEq(ownClasses(dom), "a x");

	state.c = "b";
	check("toggle survives").assertEq(ownClasses(dom), "b x");
});
