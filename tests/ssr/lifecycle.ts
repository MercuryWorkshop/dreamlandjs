import { check } from "../harness.ts";
import { jsx, createState } from "../../dist/core.js";
import {
	ssrTest,
	roundTrip,
	serverRender,
	mountDocument,
	hydrateIn,
} from "./harness.ts";

// cx.init runs on both sides, cx.mount only in the browser. Anything init does
// after an await is the interesting case: the server applies it before
// serializing, so the client has to end up in the same place.

ssrTest("ssr/lifecycle: init runs on the server, mount does not", async () => {
	let calls: string[] = [];
	let App = function (this: any) {
		this.cx.init = () => void calls.push("init");
		this.cx.mount = () => void calls.push("mount");
		return jsx("main", {});
	};

	await serverRender(App);
	check("init ran").assertEq(calls.includes("init"), true);
	check("mount did not").assertEq(calls.includes("mount"), false);
});

ssrTest(
	"ssr/lifecycle: mount runs once on the client, after hydration",
	async () => {
		let calls: string[] = [];
		let rootAtMount: any;
		let App = function (this: any) {
			this.cx.init = () => void calls.push("init");
			this.cx.mount = () => {
				calls.push("mount");
				rootAtMount = this.root;
			};
			return jsx("main", { children: jsx("p", { children: "x" }) });
		};

		let r = await roundTrip(App);

		// init on the server, then init + mount on the client
		check("call sequence").assertDeepEq(calls, ["init", "init", "mount"]);
		check("mount saw the adopted root").assertEq(
			rootAtMount,
			r.win.document.body.firstElementChild
		);
	}
);

ssrTest(
	"ssr/lifecycle: synchronous init state reaches the client dom",
	async () => {
		let App = function (this: any) {
			this.text = "default";
			this.cx.init = () => {
				this.text = "from init";
			};
			return jsx("main", { children: use(this.text) });
		};

		let r = await roundTrip(App);
		check("server rendered the init value").assertEq(
			r.body.includes("from init"),
			true
		);
		check("client agrees").assertEq(
			r.win.document.body.firstElementChild!.textContent,
			"from init"
		);
	}
);

ssrTest(
	"ssr/lifecycle: state written after an await in init round-trips",
	async () => {
		// both sides compute the same value, so this only proves the plain text
		// update path survives hydration -- mapChild mutates Text data before the
		// owned(parent) guard, so scalar changes are not suppressed
		let App = function (this: any) {
			this.text = "default";
			this.cx.init = async () => {
				await Promise.resolve();
				this.text = "after await";
			};
			return jsx("main", { children: use(this.text) });
		};

		let r = await roundTrip(App);
		check("server rendered the awaited value").assertEq(
			r.body.includes("after await"),
			true
		);
		check("client agrees").assertEq(
			r.win.document.body.firstElementChild!.textContent,
			"after await"
		);
	}
);

ssrTest(
	"KNOWN BUG ssr/lifecycle: hydration does not clobber client-only init state",
	async () => {
		// hydrateCx for a server-rendered root is deferred to the very end of
		// hydrate(), after the init drain. so anything init could only compute in
		// the browser -- matchMedia, localStorage, a client-side fetch -- is
		// overwritten by whatever the server serialized.
		let client = false;
		let App = function (this: any) {
			this.text = "default";
			this.cx.init = async () => {
				await Promise.resolve();
				if (client) this.text = "client only";
			};
			return jsx("main", { children: use(this.text) });
		};

		let r = await serverRender(App);
		check("server kept the default").assertEq(r.body.includes("default"), true);

		let win = mountDocument(r);
		client = true;
		await hydrateIn(win, App);

		check("client-only value survived").assertEq(
			win.document.body.firstElementChild!.textContent,
			"client only"
		);
	}
);

ssrTest(
	"KNOWN BUG ssr/lifecycle: structural updates during init reach the dom",
	async () => {
		// the list lives outside component state, so hydrateCx never touches it.
		// growing it during the init drain should insert a node, but mapChild's
		// insert/remove pass is behind the owned(parent) guard and is skipped.
		let state = createState({ items: ["a"] });
		let client = false;
		let App = function (this: any) {
			this.cx.init = async () => {
				await Promise.resolve();
				if (client) state.items = ["a", "b"];
			};
			return jsx("ul", {
				children: use(state.items).mapEach((x: string) =>
					jsx("li", { children: x })
				),
			});
		};

		let r = await serverRender(App);
		let win = mountDocument(r);
		client = true;
		await hydrateIn(win, App);

		check("second item was inserted").assertEq(
			win.document.querySelectorAll("li").length,
			2
		);
	}
);

ssrTest(
	"KNOWN BUG ssr/lifecycle: a pointer child that changes type during init leaks no nodes",
	async () => {
		// this.el starts null, so mapChild mounts a placeholder comment. the server
		// swaps it for the <b> and removes the placeholder, which makes the
		// placeholder a pruned id with no payload entry. the client cannot find it,
		// creates a fresh comment, inserts it via _jsx's mount loop -- and the
		// removal that would clean it up is suppressed by the owned(parent) guard.
		let App = function (this: any) {
			this.el = null;
			this.cx.init = async () => {
				await Promise.resolve();
				this.el = jsx("b", { children: "late" });
			};
			return jsx("section", { children: [use(this.el), jsx("hr", {})] });
		};

		let r = await roundTrip(App);
		let section = r.win.document.body.firstElementChild!;

		check("server settled correctly").assertEq(
			r.body.replace(/ dlssri="\d+"/g, ""),
			"<section><!--[--><b>late</b><hr></section>"
		);
		check("client has no extra placeholder").assertEq(
			[...section.childNodes].filter((n: any) => n.nodeType === 8).length,
			1
		);
		check("client markup matches server").assertEq(
			r.client.replace(/ dlssri="\d+"/g, ""),
			r.body.replace(/ dlssri="\d+"/g, "")
		);
	}
);

ssrTest(
	"ssr/lifecycle: async init is awaited before render resolves",
	async () => {
		let App = function (this: any) {
			this.text = "pending";
			this.cx.init = async () => {
				await new Promise((r) => setTimeout(r, 5));
				this.text = "resolved";
			};
			return jsx("main", { children: use(this.text) });
		};

		let r = await serverRender(App);
		check("render waited for init").assertEq(r.body.includes("resolved"), true);
		check("no pending value left behind").assertEq(
			r.body.includes("pending"),
			false
		);
	}
);

ssrTest(
	"ssr/lifecycle: nested component init ordering is depth-first",
	async () => {
		let order: string[] = [];
		let mk = (name: string, children?: () => any) =>
			function (this: any) {
				this.cx.init = () => void order.push(name);
				return jsx("div", { children: children?.() });
			};
		let Child = mk("child");
		let Parent = mk("parent", () => jsx(Child, {}));
		let App = function () {
			return jsx("main", { children: jsx(Parent, {}) });
		};

		await serverRender(App);
		// children are constructed before the parent that receives them
		check("child before parent").assertDeepEq(order, ["child", "parent"]);
	}
);

ssrTest(
	"ssr/lifecycle: state shared across components hydrates once",
	async () => {
		let state = createState({ n: 1 });
		let Show = function () {
			return jsx("span", { children: use(state.n) });
		};
		let App = function () {
			return jsx("main", { children: [jsx(Show, {}), jsx(Show, {})] });
		};

		let r = await roundTrip(App);
		let spans = [...r.win.document.querySelectorAll("span")];

		check("both rendered").assertEq(spans.length, 2);
		state.n = 2;
		check("both updated").assertEq(
			spans.every((s) => s.textContent === "2"),
			true
		);
	}
);
