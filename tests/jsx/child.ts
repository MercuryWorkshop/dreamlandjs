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
//
// the scope ident and the `dlc` component marker are attributes, not classes, so
// they share no namespace with user-controlled `class` bindings

let identOf = (el: any) =>
	el.getAttributeNames().find((c: string) => c.startsWith("dlcss-"));
let hasIdent = (el: any) => !!identOf(el);

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

	check("component root marked").assertEq(
		(dom as any).hasAttribute("dlc"),
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

jsxTest("css/ident-is-dom-normalized", () => {
	// the ident is an attribute *name*, and setAttribute lowercases those on html
	// elements. applyIdent reads names back out of getAttributeNames to decide
	// whether a child is already stamped and by whom, so an ident that is not
	// already lowercase never compares equal to the one sitting on the element --
	// and component names are conventionally PascalCase, so it never would be
	let PascalCase = function (this: any) {
		return jsx("div", { children: [jsx("span", {})] });
	} as any;
	PascalCase.style = css`
		color: red;
	`;

	let dom: any = jsx(PascalCase, {});
	let id: string = dom.$.id;

	check("the generated ident needs no normalizing").assertEq(
		id,
		id.toLowerCase()
	);
	check("root is stamped under exactly that name").assertEq(identOf(dom), id);
	check("and so is a child applyIdent walked to").assertEq(
		identOf(dom.childNodes[0]),
		id
	);
});

jsxTest("css/skips-nested-component", () => {
	// a styled child component's subtree must NOT be re-stamped by the parent's
	// ident -- applyIdent bails on any element carrying the component marker
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
	let parentIdent = identOf(dom);
	let childRoot = dom.childNodes[0] as any;

	check("nested component root is a component").assertEq(
		childRoot.hasAttribute("dlc"),
		true
	);
	check("parent ident exists").assertEq(!!parentIdent, true);
	check("nested component is NOT re-stamped with the parent ident").assertEq(
		childRoot.hasAttribute(parentIdent),
		false
	);
});

// the css ident and the component marker live in attributes, so classList holds
// only what `class` / `class:` put there
let ownClasses = (el: any) => [...el.classList].sort().join(" ");

jsxTest("class/updates-under-a-css-ident", () => {
	// the ident used to be a class, which put a second writer into classList and
	// forced every `class` update through the remove-then-add path. now that it is
	// an attribute, `class` owns classList outright and takes the wholesale path --
	// which still has to replace what the previous write left, not pile onto it
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

// --- idents stamped from outside the owning _jsx call ---------------------------
//
// these are what keeps the ident out of classList. `lastClassList` is the "someone
// else owns classes here" flag, and it is a closure local of the _jsx call that
// built the element -- only that call's own `class:` toggles ever set it. applyIdent
// is a third writer running from the *parent's* _jsx, so it can never arm the flag,
// and back when the ident was a class a later `class` update took the wholesale
// `classList.value = val` path and dropped it. The element kept rendering, it just
// silently stopped being styled.
//
// the shape is reachable whenever an element got no ident of its own, i.e.
// currentComponentCx was unset when it was built -- which is every element built
// inside a pointer listener, since only delegates restore that context.

jsxTest("css/ident-survives-external-stamp", () => {
	// built outside any component, so no ident of its own and the fastpath stays armed
	let state = createState({ c: "a" });
	let orphan: any = jsx("section", { class: use(state.c) });

	let Styled = function (this: any) {
		return jsx("div", { children: this.children });
	} as any;
	Styled.style = css`
		color: red;
	`;
	jsx(Styled, { children: [orphan] });

	check("applyIdent stamped it").assertEq(hasIdent(orphan), true);
	state.c = "b";
	check("class updated").assertEq(ownClasses(orphan), "b");
	check("ident survives the class update").assertEq(hasIdent(orphan), true);
});

jsxTest("css/ident-survives-pointer-stamp", () => {
	// same, but stamped through the identOverride path rather than the plain one
	let state = createState({ c: "a", show: true });
	let orphan: any = jsx("section", { class: use(state.c) });

	let Styled = function (this: any) {
		return jsx("div", { children: use(state.show).and(orphan) });
	} as any;
	Styled.style = css`
		color: red;
	`;
	jsx(Styled, {});

	check("pointer child stamped").assertEq(hasIdent(orphan), true);
	state.c = "b";
	check("ident survives the class update").assertEq(hasIdent(orphan), true);
});

jsxTest("css/ident-survives-stamp-in-list", () => {
	// the shape this actually shows up as: rows rebuilt by a list update are built
	// inside a pointer listener, so they never get an ident from their own _jsx
	let state = createState({ items: [1], c: "a" });
	let rows: any[] = [];

	let List = function () {
		return jsx("div", {
			children: use(state.items).mapEach(() => {
				let row = jsx("li", { class: use(state.c) });
				rows.push(row);
				return row;
			}),
		});
	} as any;
	List.style = css`
		color: red;
	`;

	jsx(List, {});
	state.items = [1, 2];

	let row = rows[rows.length - 1];
	check("rebuilt row stamped").assertEq(hasIdent(row), true);
	state.c = "b";
	check("ident survives the class update").assertEq(hasIdent(row), true);
});

// --- component ownership matrix -------------------------------------------------
//
// formalized from the manual colour-check repro in dl-test. an element is *owned*
// by the component whose body lexically created it, never by the component it ends
// up nested inside -- so slotted children keep the slotting component's ident and
// are not restyled by their host. covers the four ways an element can arrive:
// written in the body, produced by a pointer, slotted in, and slotted in through
// a pointer, each at two nesting depths.

// every test element carries `w<N>` naming its expected owner, plus a unique label
let walkTagged = (el: any, out: any[] = []) => {
	if (!el.classList) return out;
	if ([...el.classList].some((c: string) => /^w\d$/.test(c))) out.push(el);
	el.childNodes.forEach((c: any) => walkTagged(c, out));
	return out;
};

jsxTest("css/ownership-matrix", () => {
	let state = createState({ ref: 0 });
	let mk = (label: string, owner: number) =>
		jsx("div", { class: `${label} w${owner}` });
	let mkDyn = (label: string, owner: number) =>
		use(state.ref).map(() => mk(label, owner));

	let box1: any, box2: any;

	let Box2 = function (this: any) {
		return jsx("div", {
			children: [mk("box2-own", 2), mkDyn("box2-own-dyn", 2), this.children],
		});
	} as any;
	Box2.style = css`
		color: green;
	`;

	let Box1 = function (this: any) {
		return jsx("div", {
			children: [mk("box1-own", 1), mkDyn("box1-own-dyn", 1), this.children],
		});
	} as any;
	Box1.style = css`
		color: blue;
	`;

	let Root = function () {
		return jsx("div", {
			children: [
				mk("root-own", 0),
				mkDyn("root-own-dyn", 0),
				(box1 = jsx(Box1, {
					children: [
						// written in Root's body, so Box1 must not claim them
						mk("root-slotted", 0),
						mkDyn("root-slotted-dyn", 0),
						(box2 = jsx(Box2, { children: [mk("root-slotted-deep", 0)] })),
					],
				})),
			],
		});
	} as any;
	Root.style = css`
		color: red;
	`;

	let dom: any = jsx(Root, {});
	// read from each cx rather than off the dom, so every comparison below is the
	// ident the library generated against the one the dom actually stored
	let owners = () => [dom.$.id, box1.$.id, box2.$.id];

	check("the three components have distinct idents").assertEq(
		new Set(owners()).size,
		3
	);

	let mismatches = () => {
		let want = owners();
		return (
			walkTagged(dom)
				.map((el: any) => {
					let classes = [...el.classList];
					let label = classes.find(
						(c: string) => !c.startsWith("dlcss-") && !/^w\d$/.test(c)
					);
					let n = +classes.find((c: string) => /^w\d$/.test(c))!.slice(1);
					return identOf(el) === want[n]
						? null
						: `${label}: want w${n} (${want[n]}) got ${identOf(el) || "(none)"}`;
				})
				.filter(Boolean)
				.join("\n  ") || "none"
		);
	};

	// a broken walk would make the mismatch check vacuously pass
	check("all nine tagged elements found").assertEq(walkTagged(dom).length, 9);
	check("every element is owned by the component that wrote it").assertEq(
		mismatches(),
		"none"
	);

	// the pointer-built elements are rebuilt outside any component context, so this
	// is the half that exercises identOverride rather than the stamp in _jsx
	state.ref = 1;
	check("still nine after a rebuild").assertEq(walkTagged(dom).length, 9);
	check("ownership survives a pointer rebuild").assertEq(mismatches(), "none");
});

// --- the two ways ownership is *not* the renderer --------------------------------
//
// the matrix above is written entirely inside component bodies, so every element in
// it has an owner and every pointer in it has one too. these are the two shapes
// where that does not hold: an element built with no component context (which has to
// fall back to whoever renders it) and an element built by one component but
// rendered by another (which has to keep the ident it already has). both arrive
// through the same mapChild walk, and it has to answer them differently.

jsxTest("css/ident-falls-back-for-an-unowned-pointer", () => {
	// built out here rather than in a body, so there is no cx to capture and nothing
	// to inherit; the map runs unowned on every read, initial and rebuild alike
	let state = createState({ n: 0 });
	let ptr = use(state.n).map(() => jsx("li", {}));

	let Styled = function () {
		return jsx("ul", { children: [ptr] });
	} as any;
	Styled.style = css`
		color: red;
	`;

	let dom: any = jsx(Styled, {});
	let id: string = dom.$.id;

	check("content adopts the ident of the component rendering it").assertEq(
		identOf(dom.childNodes[1]),
		id
	);

	// the rebuild is the half that matters: the pointer has no cx to restore, so
	// without the walk's own ident the row comes back unstamped and stops matching
	state.n = 1;
	check("and keeps it across a rebuild").assertEq(
		identOf(dom.childNodes[1]),
		id
	);
});

jsxTest("css/a-map-is-owned-where-it-is-written", () => {
	// what a map builds belongs to the body the callback was written in, which is the
	// cx `.map()` captured -- not the cx of the pointer it reads from. those are the
	// same thing for `use(x).map(f)` written in one go, and only come apart once the
	// source pointer is handed across a component boundary
	let state = createState({ n: 0 });
	let src: any;

	let Src = function () {
		src = use(state.n);
		return jsx("i", {});
	} as any;
	Src.style = css`
		color: green;
	`;
	let source: any = jsx(Src, {});

	// written in Mapper's body, so Mapper owns the row even though Src owns the source
	let Mapper = function () {
		return jsx("div", { children: [src.map(() => jsx("span", {}))] });
	} as any;
	Mapper.style = css`
		color: red;
	`;
	let mapper: any = jsx(Mapper, {});

	// written out here with no cx to capture, so it falls back to whoever renders it
	let unowned = src.map(() => jsx("span", {}));
	let Renderer = function () {
		return jsx("div", { children: [unowned] });
	} as any;
	Renderer.style = css`
		color: blue;
	`;
	let renderer: any = jsx(Renderer, {});

	let row = (dom: any) => identOf(dom.childNodes[1]);

	check("the three components have distinct idents").assertEq(
		new Set([source.$.id, mapper.$.id, renderer.$.id]).size,
		3
	);
	check("a map written in a body is owned by that body").assertEq(
		row(mapper),
		mapper.$.id
	);
	check("and not by the owner of the pointer it reads").assertEq(
		row(mapper) === source.$.id,
		false
	);
	check("an unowned map is adopted by the component rendering it").assertEq(
		row(renderer),
		renderer.$.id
	);

	// the rebuild reads through the same getter, so it has to answer the same way
	state.n = 1;
	check("ownership survives a rebuild").assertEq(row(mapper), mapper.$.id);
	check("adoption survives a rebuild").assertEq(row(renderer), renderer.$.id);
});

jsxTest("css/foreign-element-keeps-its-owner", () => {
	// built inside Owner, so Owner stamped it -- but never attached there
	let held: any;
	let Owner = function () {
		held = jsx("span", {});
		return jsx("i", {});
	} as any;
	Owner.style = css`
		color: green;
	`;
	let owner: any = jsx(Owner, {});

	// handed to a second component through a pointer that Renderer owns. the pointer
	// is the renderer's, the element is not, and the element wins
	let state = createState({ v: 0 });
	let Renderer = function () {
		return jsx("div", { children: [use(state.v).map(() => held)] });
	} as any;
	Renderer.style = css`
		color: red;
	`;
	let dom: any = jsx(Renderer, {});

	check("the two components have distinct idents").assertEq(
		owner.$.id === dom.$.id,
		false
	);
	check("Owner stamped it when it was built").assertEq(
		identOf(held),
		owner.$.id
	);
	check("rendering it elsewhere does not re-stamp it").assertEq(
		identOf(dom.childNodes[1]),
		owner.$.id
	);
	check("and it is not the renderer's").assertEq(
		identOf(dom.childNodes[1]) === dom.$.id,
		false
	);
});
