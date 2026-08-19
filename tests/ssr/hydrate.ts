import { check } from "../harness.ts";
import { jsx, css, createState } from "../../dist/core.js";
import {
	ssrTest,
	roundTrip,
	serverRender,
	mountDocument,
	hydrateIn,
	norm,
	shape,
} from "./harness.ts";

// The contract hydration is supposed to uphold: afterwards the dom is the one
// the server sent -- the same node objects, not equivalent replacements -- and
// every binding is live.

ssrTest("ssr/hydrate: static tree round-trips", async () => {
	let Leaf = function () {
		return jsx("span", { children: "leaf" });
	};
	let App = function () {
		return jsx("main", {
			children: [jsx("h1", { children: "hi" }), jsx(Leaf, {})],
		});
	};

	let r = await roundTrip(App);
	check("server markup").assertEq(
		norm(r.body),
		"<main><h1>hi</h1><span>leaf</span></main>"
	);
	check("client matches server").assertEq(norm(r.client), norm(r.body));
});

ssrTest(
	"ssr/hydrate: adopts server nodes instead of rebuilding them",
	async () => {
		let App = function () {
			return jsx("main", {
				children: [
					jsx("p", { children: "one" }),
					jsx("ul", {
						children: [1, 2, 3].map((i) => jsx("li", { children: "" + i })),
					}),
				],
			});
		};

		let win = mountDocument(await serverRender(App));
		let before = [...win.document.body.querySelectorAll("*")];
		let root = await hydrateIn(win, App);
		let after = [...win.document.body.querySelectorAll("*")];

		check("no elements added or dropped").assertEq(after.length, before.length);
		// identity, not equality: a fresh element with the same tag passes a markup
		// comparison while having lost every server-rendered attribute and leaving
		// the original orphaned in the tree
		check("every element is the same object").assertEq(
			after.every((x, i) => x === before[i]),
			true
		);
		check("hydrate returns the server root").assertEq(
			root,
			win.document.body.firstElementChild
		);
	}
);

ssrTest("ssr/hydrate: listeners bind to the adopted elements", async () => {
	let state = createState({ clicks: 0 });
	let App = function () {
		return jsx("main", {
			children: [
				jsx("button", { "on:click": () => state.clicks++, children: "click" }),
				jsx("span", { children: use(state.clicks) }),
			],
		});
	};

	let r = await roundTrip(App);
	let button = r.win.document.querySelector("button")!;
	let span = r.win.document.querySelector("span")!;

	check("server rendered the initial value").assertEq(span.textContent, "0");
	button.click();
	check("listener fired").assertEq(state.clicks, 1);
	check("dom updated through the server node").assertEq(span.textContent, "1");
});

ssrTest("ssr/hydrate: pointer-driven attributes stay live", async () => {
	let state = createState({ cls: "a", flag: false });
	let App = function () {
		return jsx("main", {
			children: jsx("div", {
				class: use(state.cls),
				"attr:inert": use(state.flag),
			}),
		});
	};

	let r = await roundTrip(App);
	let div = r.win.document.querySelector("div")!;

	check("server rendered the class").assertEq(div.getAttribute("class"), "a");
	state.cls = "b";
	check("class updates after hydration").assertEq(
		div.getAttribute("class"),
		"b"
	);
	state.flag = true;
	check("property updates after hydration").assertEq((div as any).inert, true);
});

ssrTest("ssr/hydrate: null pointer children round-trip", async () => {
	let state = createState({ value: null as string | null });
	let App = function () {
		return jsx("main", { children: [use(state.value), jsx("hr", {})] });
	};

	let r = await roundTrip(App);
	let main = r.win.document.body.firstElementChild;

	check("client matches server").assertEq(norm(r.client), norm(r.body));
	// anchor for the pointer, placeholder for its null value, then the hr
	check("no stray nodes").assertEq(shape(main), "!,!,<hr>");

	state.value = "now set";
	check("placeholder is replaced, not appended").assertEq(
		shape(main),
		'!,"now set",<hr>'
	);
});

ssrTest("ssr/hydrate: adjacent text nodes are re-split", async () => {
	// the server emits these as two text nodes; the html parser merges them into
	// one, so the payload has to carry enough to cut it apart again or every
	// later child index in this parent is off by one
	let App = function () {
		return jsx("p", { children: ["one", "two", jsx("i", {})] });
	};

	let r = await roundTrip(App);
	let p = r.win.document.body.firstElementChild;

	// one entry per node in the run, including the trailing one that never needs
	// splitting -- redundant but harmless, so this only asserts the split exists
	check("payload carries the split").assertEq(r.payload.t.length > 0, true);
	check("text is two nodes again").assertEq(shape(p), '"one","two",<i>');
	check("markup is unchanged").assertEq(norm(r.client), norm(r.body));
});

ssrTest("ssr/hydrate: svg elements round-trip", async () => {
	let App = function () {
		return jsx("main", {
			children: jsx("svg", {
				xmlns: "http://www.w3.org/2000/svg",
				children: jsx("circle", { r: "5" }),
			}),
		});
	};

	let r = await roundTrip(App);
	// compared structurally: dom-serializer self-closes empty foreign elements
	// and happy-dom does not, which is a serializer difference, not a hydration one
	let circle = r.win.document.querySelector("circle")!;

	check("circle survived hydration").assertEq(!!circle, true);
	check("attribute survived").assertEq(circle.getAttribute("r"), "5");
	check("still in the svg namespace").assertEq(
		circle.namespaceURI,
		"http://www.w3.org/2000/svg"
	);
	check("no duplicate svg subtree").assertEq(
		r.win.document.querySelectorAll("circle").length,
		1
	);
});

ssrTest(
	"ssr/hydrate: component css is installed once and scopes match",
	async () => {
		let Styled: any = function () {
			return jsx("div", { children: "styled" });
		};
		Styled.style = css`
			:scope {
				color: red;
			}
		`;
		let App = function () {
			return jsx("main", { children: [jsx(Styled, {}), jsx(Styled, {})] });
		};

		let r = await roundTrip(App);
		let styles = [...r.win.document.head.querySelectorAll("style")];

		check("one stylesheet for two instances").assertEq(styles.length, 1);
		check("client did not append another").assertEq(
			r.win.document.querySelectorAll("style").length,
			1
		);

		// both instances must carry the scope attribute the server baked into the
		// stylesheet -- a mismatch here renders the component unstyled
		let ident = styles[0].getAttribute("dlcss-id")!;
		let divs = [...r.win.document.querySelectorAll("div")];
		check("ident is present").assertEq(!!ident, true);
		check("scope ident is on both instances").assertEq(
			divs.length === 2 && divs.every((d) => d.hasAttribute(ident)),
			true
		);
		check("stylesheet text uses that ident").assertEq(
			styles[0].textContent!.includes(ident),
			true
		);
	}
);
