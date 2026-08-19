import { check } from "../harness.ts";
import { jsx, NO_CHANGE } from "../../dist/core.js";
import {
	ssrTest,
	roundTrip,
	serverRender,
	mountDocument,
	hydrateIn,
} from "./harness.ts";

// Every test here makes the server and the client compute *different* values, so
// a pass means the server's value actually crossed the wire rather than the
// client happening to recompute the same thing.

let sided = (build: (side: string) => any) => {
	let side = "server";
	let App = function (this: any) {
		Object.assign(this, build(side));
		return jsx("main", {});
	};
	return {
		App,
		toClient: () => {
			side = "client";
		},
	};
};

let hydrated = async (App: any, toClient: () => void) => {
	let r = await serverRender(App);
	let win = mountDocument(r);
	toClient();
	let root: any = await hydrateIn(win, App);
	return { payload: r.payload, state: root.$.state };
};

ssrTest("scalars come from the server, not the client body", async () => {
	let { App, toClient } = sided((side) => ({
		str: side,
		num: side === "server" ? 42 : -1,
		bool: side === "server",
	}));

	let { state } = await hydrated(App, toClient);
	check("string").assertEq(state.str, "server");
	check("number").assertEq(state.num, 42);
	check("boolean").assertEq(state.bool, true);
});

ssrTest("KNOWN BUG: a null value does not crash serialization", async () => {
	// typeof null is "object", so _val falls past the primitive branch, misses
	// Map/Set/Array, and reaches `val.constructor`. `this.data = null` is the most
	// natural way to declare a slot a component fills in later
	let App = function (this: any) {
		this.data = null;
		return jsx("main", {});
	};

	let threw: unknown;
	try {
		await serverRender(App);
	} catch (e) {
		threw = e;
	}
	check("render survived").assertEq(threw === undefined, true);
});

ssrTest("KNOWN BUG: undefined does not come back as null", async () => {
	// typeof undefined is not in the object branch, so it is pushed into data.v
	// as-is -- and JSON.stringify turns a hole in an array into null, so the
	// client reads back a different type than the server had
	let { App, toClient } = sided((side) => ({
		gone: side === "server" ? undefined : "placeholder",
		kept: side === "server" ? "here" : "",
	}));

	let { state } = await hydrated(App, toClient);
	check("neighbour crossed the wire").assertEq(state.kept, "here");
	check("undefined stayed undefined").assertEq(state.gone, undefined);
});

ssrTest("nested plain objects round-trip", async () => {
	let { App, toClient } = sided((side) => ({
		cfg:
			side === "server"
				? { a: 1, deep: { b: "two" } }
				: { a: 0, deep: { b: "" } },
	}));

	let { state } = await hydrated(App, toClient);
	check("shallow key").assertEq(state.cfg.a, 1);
	check("nested key").assertEq(state.cfg.deep.b, "two");
});

ssrTest("arrays, maps and sets round-trip", async () => {
	let { App, toClient } = sided((side) => ({
		arr: side === "server" ? [1, 2, 3] : [],
		map: side === "server" ? new Map([["k", "v"]]) : new Map(),
		set: side === "server" ? new Set(["a", "b"]) : new Set(),
	}));

	let { state } = await hydrated(App, toClient);
	check("array").assertDeepEq(state.arr, [1, 2, 3]);
	check("map is a Map").assertInstance(state.map, Map);
	check("map contents").assertEq(state.map.get("k"), "v");
	check("set is a Set").assertInstance(state.set, Set);
	check("set contents").assertEq([...state.set].join(","), "a,b");
});

ssrTest("[NO_CHANGE] opts an object out of serialization", async () => {
	let App = function (this: any) {
		this[NO_CHANGE] = true;
		this.secret = "must not ship";
		this.alsoSecret = { token: "nope" };
		return jsx("main", {});
	};

	let r = await serverRender(App);
	check("no keys serialized").assertEq(r.payload.k.includes("secret"), false);
	check("no values serialized").assertEq(
		JSON.stringify(r.payload.v).includes("must not ship"),
		false
	);
	check("nested value did not leak").assertEq(
		JSON.stringify(r.payload).includes("nope"),
		false
	);
});

ssrTest("dom nodes and functions are not serialized", async () => {
	let App = function (this: any) {
		this.fn = () => "nope";
		this.node = jsx("div", {});
		this.keep = "yes";
		return jsx("main", {});
	};

	let r = await serverRender(App);
	check("keeps plain values").assertEq(r.payload.k.includes("keep"), true);
	check("drops functions").assertEq(r.payload.k.includes("fn"), false);
	check("drops nodes").assertEq(r.payload.k.includes("node"), false);
	// `root` is set on every component's state and is always a node
	check("drops the component root").assertEq(
		r.payload.k.includes("root"),
		false
	);
});

ssrTest("values are interned rather than repeated", async () => {
	let Child = function (this: any) {
		this.label = "a repeated value";
		return jsx("li", {});
	};
	let App = function () {
		return jsx("ul", { children: [1, 2, 3].map(() => jsx(Child, {})) });
	};

	let r = await serverRender(App);
	let occurrences = r.payload.v.filter(
		(x: any) => x === "a repeated value"
	).length;
	check("stored once").assertEq(occurrences, 1);
	check("keys interned too").assertEq(
		r.payload.k.filter((x) => x === "label").length,
		1
	);
});

ssrTest("KNOWN BUG: cyclic state does not crash the render", async () => {
	// _serialize has no seen-set, so this recurses until the stack gives out.
	// devalue/seroval handle this by interning objects and emitting back-references
	let App = function (this: any) {
		let a: any = { name: "a" };
		a.self = a;
		this.obj = a;
		return jsx("main", {});
	};

	let threw: unknown;
	try {
		await serverRender(App);
	} catch (e) {
		threw = e;
	}
	check("render survived").assertEq(threw === undefined, true);
});

ssrTest("KNOWN BUG: shared references keep their identity", async () => {
	// the same object reached twice is serialized twice, so hydration produces two
	// unrelated objects and any aliasing the component relied on is gone
	// aliased on the server, two distinct objects on the client, so a pass means
	// the payload carried the aliasing rather than the client body recreating it
	let { App, toClient } = sided((side) => {
		if (side !== "server") return { a: { n: 0 }, b: { n: 0 } };
		let shared = { n: 1 };
		return { a: shared, b: shared };
	});

	let { state } = await hydrated(App, toClient);
	check("values came from the server").assertEq(state.a.n, 1);
	check("still the same object").assertEq(state.a === state.b, true);
});

ssrTest("props passed down are still readable after hydration", async () => {
	let Child = function (this: any) {
		return jsx("span", { children: use(this.label) });
	};
	let App = function (this: any) {
		this.label = "from parent";
		return jsx("main", { children: jsx(Child, { label: use(this.label) }) });
	};

	let r = await roundTrip(App);
	check("rendered").assertEq(
		r.win.document.querySelector("span")!.textContent,
		"from parent"
	);

	r.root.$.state.label = "changed";
	check("prop pointer still live").assertEq(
		r.win.document.querySelector("span")!.textContent,
		"changed"
	);
});
