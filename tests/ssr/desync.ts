import { check } from "../harness.ts";
import { jsx } from "../../dist/core.js";
import {
	ssrTest,
	serverRender,
	mountDocument,
	hydrateIn,
	norm,
} from "./harness.ts";

// Hydration walks a single global counter and looks each id up by attribute, so
// one extra or missing node on the client shifts every lookup after it. These
// tests pin down how far the damage is allowed to spread.

ssrTest(
	"KNOWN BUG: an extra client element does not destroy its siblings",
	async () => {
		let client = false;
		let Middle = function () {
			return jsx("div", {
				class: "mid",
				children: [
					client ? jsx("i", { children: "extra" }) : null,
					jsx("span", { children: "inner" }),
				],
			});
		};
		let App = function () {
			return jsx("main", {
				children: [
					jsx("h1", { children: "title" }),
					jsx(Middle, {}),
					jsx("p", { id: "tail", children: "tail-text" }),
					jsx("footer", { children: "foot" }),
				],
			});
		};

		let r = await serverRender(App);
		let win = mountDocument(r);
		client = true;
		await hydrateIn(win, App);

		let doc = win.document;
		// the divergence is inside Middle; nothing outside it should notice
		check("heading survived").assertEq(
			doc.querySelector("h1")?.textContent,
			"title"
		);
		check("tail survived").assertEq(
			doc.querySelector("#tail")?.textContent,
			"tail-text"
		);
		check("footer survived").assertEq(
			doc.querySelector("footer")?.textContent,
			"foot"
		);
		check("no duplicated footer").assertEq(
			doc.querySelectorAll("footer").length,
			1
		);
	}
);

ssrTest(
	"KNOWN BUG: a missing client element does not destroy its siblings",
	async () => {
		// the mirror case: the server rendered a node the client does not, so the
		// counter runs ahead instead of behind
		let client = false;
		let Middle = function () {
			return jsx("div", {
				class: "mid",
				children: [
					client ? null : jsx("i", { children: "server only" }),
					jsx("span", { children: "inner" }),
				],
			});
		};
		let App = function () {
			return jsx("main", {
				children: [
					jsx(Middle, {}),
					jsx("footer", { id: "after", children: "foot" }),
				],
			});
		};

		let r = await serverRender(App);
		let win = mountDocument(r);
		client = true;
		await hydrateIn(win, App);

		let doc = win.document;
		// whether the stale server-only <i> gets removed is a design choice; what
		// is not negotiable is that unrelated content stays put
		check("the diverging component's own root survived").assertEq(
			!!doc.querySelector(".mid"),
			true
		);
		check("its sibling content survived").assertEq(
			doc.querySelector(".mid span")?.textContent,
			"inner"
		);
		check("footer survived").assertEq(
			doc.querySelector("#after")?.textContent,
			"foot"
		);
	}
);

ssrTest(
	"KNOWN BUG: a tag mismatch does not adopt the wrong element",
	async () => {
		// createElement looks the id up and uses whatever comes back. the dev build
		// warns about the tag mismatch but still adopts it, so bindings meant for a
		// <span> land on a <p>
		let client = false;
		let App = function () {
			return jsx("main", {
				children: client
					? jsx("span", { id: "swapped", children: "x" })
					: jsx("p", { id: "swapped", children: "x" }),
			});
		};

		let r = await serverRender(App);
		let win = mountDocument(r);
		client = true;
		let root: any = await hydrateIn(win, App);

		check("client got the tag it asked for").assertEq(
			root.firstElementChild?.tagName,
			"SPAN"
		);
	}
);

ssrTest("identical trees leave the counter aligned", async () => {
	// the control for the tests above: no divergence, so nothing is created that
	// the server did not send and the markup is byte-identical
	let Row = function (this: any) {
		return jsx("li", { children: [jsx("b", {}), use(this.label)] });
	};
	let App = function () {
		return jsx("ul", {
			children: ["a", "b", "c"].map((label) => jsx(Row, { label })),
		});
	};

	let r = await serverRender(App);
	let win = mountDocument(r);
	let before = win.document.body.querySelectorAll("*").length;
	await hydrateIn(win, App);

	check("no elements added").assertEq(
		win.document.body.querySelectorAll("*").length,
		before
	);
	check("markup unchanged").assertEq(
		norm(win.document.body.innerHTML),
		norm(r.body)
	);
});

ssrTest(
	"KNOWN BUG: a client-only component does not shift its siblings",
	async () => {
		// component instantiation order is what any per-component payload key would
		// be counted against, so an extra component is the coarsest divergence there is
		let client = false;
		let Extra = function () {
			return jsx("em", { children: "extra" });
		};
		let Tail = function () {
			return jsx("footer", { id: "tail", children: "foot" });
		};
		let App = function () {
			return jsx("main", {
				children: [client ? jsx(Extra, {}) : null, jsx(Tail, {})],
			});
		};

		let r = await serverRender(App);
		let win = mountDocument(r);
		client = true;
		await hydrateIn(win, App);

		check("tail survived").assertEq(
			win.document.querySelector("#tail")?.textContent,
			"foot"
		);
	}
);
