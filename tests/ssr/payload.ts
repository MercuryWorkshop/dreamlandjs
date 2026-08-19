import { check } from "../harness.ts";
import { jsx } from "../../dist/core.js";
import {
	ssrTest,
	roundTrip,
	serverRender,
	mountDocument,
	hydrateIn,
	comments,
} from "./harness.ts";

// The payload rides inside <script type="application/json"> in the head, so it
// has to survive both the html serializer and the html parser without the
// content being able to reach back out into markup.

let HOSTILE = `</script><img src=x onerror=alert(1)>`;

ssrTest("state cannot break out of the data script", async () => {
	let App = function (this: any) {
		this.evil = HOSTILE;
		return jsx("main", {});
	};

	let r = await serverRender(App);
	// exactly one </script -- the tag that closes the payload itself
	let closers = r.head.split("</script").length - 1;
	check("no early script close").assertEq(closers, 1);
	check("no raw img tag in markup").assertEq(r.head.includes("<img"), false);
});

ssrTest("hostile state still hydrates to the original string", async () => {
	let side = "server";
	let App = function (this: any) {
		this.evil = side === "server" ? HOSTILE : "";
		return jsx("main", {});
	};

	let r = await serverRender(App);
	let win = mountDocument(r);
	side = "client";
	let root: any = await hydrateIn(win, App);

	check("decoded byte for byte").assertEq(root.$.state.evil, HOSTILE);
	check("nothing was injected into the document").assertEq(
		win.document.querySelectorAll("img").length,
		0
	);
});

ssrTest("quotes, newlines and astral characters survive", async () => {
	let tricky =
		// \u2028/\u2029 are legal inside a json string but were historically illegal
		// inside a js string literal, which is why react and next escape them
		`"double" 'single' &amp; <b> \n\t \u2028 \u2029 \u00a0 \u{1F600} \\ back`;
	let side = "server";
	let App = function (this: any) {
		this.text = side === "server" ? tricky : "";
		return jsx("main", {});
	};

	let r = await serverRender(App);
	let win = mountDocument(r);
	side = "client";
	let root: any = await hydrateIn(win, App);

	check("round-tripped exactly").assertEq(root.$.state.text, tricky);
});

ssrTest("text content is escaped in markup, not injected", async () => {
	let App = function () {
		return jsx("main", { children: "<b>not bold</b>" });
	};

	let r = await roundTrip(App);
	check("server escaped it").assertEq(r.body.includes("&lt;b&gt;"), true);
	check("no element was created").assertEq(
		r.win.document.querySelectorAll("b").length,
		0
	);
	check("text is intact after hydration").assertEq(
		r.win.document.body.firstElementChild!.textContent,
		"<b>not bold</b>"
	);
});

ssrTest("text and comment entries point at their real parent", async () => {
	let App = function () {
		return jsx("main", {
			children: [jsx("p", { children: "a" }), jsx("p", { children: "b" })],
		});
	};

	let r = await roundTrip(App);
	let byId = new Map<number, any>();
	for (let el of [
		r.win.document.body.firstElementChild,
		...r.win.document.body.querySelectorAll("[dlssri]"),
	])
		byId.set(+el.getAttribute("dlssri")!, el);

	let bad: string[] = [];
	for (let [id, entry] of Object.entries(r.payload.n)) {
		// [parent, childIndex] entries are the text/comment ones; component state
		// entries are arrays of [keyIndex, value] pairs
		if (!Array.isArray(entry) || typeof entry[0] !== "number") continue;
		let parent = byId.get(entry[0]);
		if (!parent) bad.push(`${id}: parent ${entry[0]} not in the document`);
		else if (!parent.childNodes[entry[1]])
			bad.push(`${id}: parent ${entry[0]} has no child at ${entry[1]}`);
	}
	check("every entry resolves").assertEq(bad.join("; ") || "ok", "ok");
});

ssrTest("KNOWN BUG: a null child serializes as an empty comment", async () => {
	// new_Comment() is called with no argument, and the ssr vdom stringifies it
	// as "" + undefined. nine wasted bytes on every conditional in the tree, and
	// the client's fallback would produce "" instead
	let App = function () {
		return jsx("main", { children: [null, jsx("hr", {})] });
	};

	let r = await roundTrip(App);
	check("server markup").assertEq(r.body.includes("<!--undefined-->"), false);
	check("comment is empty").assertEq(
		comments(r.win.document.body.firstElementChild).join("|"),
		""
	);
});

ssrTest("no entry is emitted for plain elements", async () => {
	// only component roots and text/comment nodes need payload entries; a tree of
	// plain elements should cost nothing beyond its dlssri attributes
	let App = function () {
		return jsx("main", {
			children: jsx("div", {
				children: jsx("span", { children: jsx("i", {}) }),
			}),
		});
	};

	let r = await serverRender(App);
	let entries = Object.keys(r.payload.n).length;
	// just the App component root
	check("one entry for the component root").assertEq(entries, 1);
});
