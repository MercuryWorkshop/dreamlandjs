import { check } from "../harness.ts";
import { jsx, NO_CHANGE } from "../../dist/core.js";
import {
	ssrTest,
	roundTrip,
	serverRender,
	mountDocument,
	hydrateIn,
} from "./harness.ts";

// Only what a `cx.load` writes gets serialized, so every test here does its
// writing inside one. The client skips a load whose component has a payload
// entry, which is what makes the sided() trick below load-bearing: the client
// body computes a *different* value and never gets to run, so anything the
// client ends up holding must have come across the wire.

let sided = (build: (side: string) => any) => {
	let side = "server";
	let App = function (this: any) {
		this.cx.load = () => Object.assign(this, build(side));
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

ssrTest("a null value round-trips", async () => {
	// typeof null is "object", so a walk that reaches for val.constructor before
	// testing for null crashes here. `this.data = null` is the most natural way to
	// declare a slot a component fills in later
	let { App, toClient } = sided((side) => ({
		data: side === "server" ? null : "placeholder",
		kept: side === "server" ? "here" : "",
	}));

	let { state } = await hydrated(App, toClient);
	check("neighbour crossed the wire").assertEq(state.kept, "here");
	check("null stayed null").assertEq(state.data, null);
});

ssrTest("undefined stays undefined and stays distinct from null", async () => {
	// JSON.stringify turns an undefined array slot into null, so the value store
	// needs its own encoding for undefined or the client reads back a value of a
	// different type than the server held
	let { App, toClient } = sided((side) => ({
		gone: side === "server" ? undefined : "placeholder",
		nulled: side === "server" ? null : "placeholder",
		kept: side === "server" ? "here" : "",
	}));

	let { state } = await hydrated(App, toClient);
	check("neighbour crossed the wire").assertEq(state.kept, "here");
	check("undefined stayed undefined").assertEq(state.gone, undefined);
	check("the key still exists").assertEq("gone" in state, true);
	check("null did not collapse into it").assertEq(state.nulled, null);
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
	// the objects inside the collections matter as much as the collections: a
	// value walk that only handles plain objects at the top of a change drops
	// them, which is the shape every list of rows from a query has
	let { App, toClient } = sided((side) => ({
		arr: side === "server" ? [1, { deep: "two" }, 3] : [],
		map: side === "server" ? new Map([["k", { v: "deep" }]]) : new Map(),
		set: side === "server" ? new Set(["a", "b"]) : new Set(),
	}));

	let { state } = await hydrated(App, toClient);
	check("array").assertDeepEq(state.arr, [1, { deep: "two" }, 3]);
	check("object inside the array").assertEq(state.arr[1].deep, "two");
	check("map is a Map").assertInstance(state.map, Map);
	check("object inside the map").assertEq(state.map.get("k").v, "deep");
	check("set is a Set").assertInstance(state.set, Set);
	check("set contents").assertEq([...state.set].join(","), "a,b");
});

ssrTest(
	"[NO_CHANGE] opts a component's state out of serialization",
	async () => {
		let App = function (this: any) {
			this[NO_CHANGE] = true;
			this.cx.load = () => {
				this.secret = "must not ship";
				this.alsoSecret = { token: "nope" };
			};
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
	}
);

ssrTest("[NO_CHANGE] on a nested object keeps it out of a value", async () => {
	// the marker has to be honoured while walking a value, not only when deciding
	// whether to watch a state object -- otherwise anything a load happens to hang
	// off its state carries the marked object across with it
	let App = function (this: any) {
		this.cx.load = () => {
			let marked: any = { token: "nope" };
			marked[NO_CHANGE] = true;
			this.direct = marked;
			this.nested = { ok: "yes", inner: marked };
			this.inList = [marked, "tail"];
		};
		return jsx("main", {});
	};

	let r = await serverRender(App);
	check("nothing leaked").assertEq(
		JSON.stringify(r.payload).includes("nope"),
		false
	);
	check("the unmarked neighbour still shipped").assertEq(
		JSON.stringify(r.payload.v).includes("yes"),
		true
	);
});

ssrTest("dom nodes and functions are not serialized", async () => {
	// and just as importantly they must not serialize as null: the client builds
	// its own node in the body, so an entry under that key would overwrite it
	let side = "server";
	let App = function (this: any) {
		this.el = "client-built";
		this.cx.load = () => {
			this.fn = () => "nope";
			this.el = side === "server" ? jsx("div", {}) : "client-built";
			this.keep = "yes";
		};
		return jsx("main", {});
	};

	let r = await serverRender(App);
	check("keeps plain values").assertEq(r.payload.k.includes("keep"), true);
	check("drops functions").assertEq(r.payload.k.includes("fn"), false);
	check("drops nodes").assertEq(r.payload.k.includes("el"), false);
	// `root` is assigned to the raw state object rather than through the proxy, so
	// it never notifies and never reaches a payload
	check("drops the component root").assertEq(
		r.payload.k.includes("root"),
		false
	);

	let win = mountDocument(r);
	side = "client";
	let root: any = await hydrateIn(win, App);
	check("did not clobber the client's own value").assertEq(
		root.$.state.el,
		"client-built"
	);
});

ssrTest("values are interned rather than repeated", async () => {
	let Child = function (this: any) {
		this.cx.load = () => {
			this.label = "a repeated value";
		};
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

ssrTest("cyclic state round-trips with its identity intact", async () => {
	// a walk with no seen-set recurses until the stack gives out; one that interns
	// values and emits back-references gets the cycle back on the client. arrays
	// need their own identity for this, not just plain objects
	let side = "server";
	let App = function (this: any) {
		this.cx.load = () => {
			let obj: any = { name: side };
			obj.self = obj;
			this.obj = obj;

			let arr: any[] = [];
			arr.push(arr, side);
			this.arr = arr;
		};
		return jsx("main", {});
	};

	let r = await serverRender(App);
	let win = mountDocument(r);
	side = "client";
	let state: any = (await hydrateIn(win, App)).$.state;

	check("value came from the server").assertEq(state.obj.name, "server");
	check("the object cycle survived").assertEq(
		state.obj.self === state.obj,
		true
	);
	check("the array cycle survived").assertEq(state.arr[0] === state.arr, true);
	check("the array's other slot").assertEq(state.arr[1], "server");
});

ssrTest("shared references keep their identity", async () => {
	// the same object reached twice must be interned once and referenced twice,
	// or hydration produces two unrelated objects and any aliasing the component
	// relied on is gone. aliased on the server, two distinct objects on the
	// client, so a pass means the payload carried the aliasing
	let { App, toClient } = sided((side) => {
		if (side !== "server") return { a: { n: 0 }, b: { n: 0 } };
		let shared = { n: 1 };
		return { a: shared, b: shared };
	});

	let { state } = await hydrated(App, toClient);
	check("values came from the server").assertEq(state.a.n, 1);
	check("still the same object").assertEq(state.a === state.b, true);
});

ssrTest(
	"an object shared between two components stays one object",
	async () => {
		// the identity map is scoped to the render rather than to a single load, so
		// two components that reach the same object both point at one interned entry
		let shared = { tag: "shared" };
		let Child = function (this: any) {
			this.cx.load = () => {
				this.s = shared;
			};
			return jsx("span", {});
		};
		let App = function (this: any) {
			this.cx.load = () => {
				this.s = shared;
			};
			return jsx("main", { children: jsx(Child, {}) });
		};

		let r = await serverRender(App);
		let win = mountDocument(r);
		let root: any = await hydrateIn(win, App);
		let child: any = win.document.querySelector("span");

		check("parent got it").assertDeepEq(root.$.state.s, { tag: "shared" });
		check("child got it").assertDeepEq(child.$.state.s, { tag: "shared" });
		check("still one object").assertEq(
			root.$.state.s === child.$.state.s,
			true
		);
	}
);

ssrTest("wrapper and inner components keep their own load state", async () => {
	let Inner = function (this: any) {
		this.cx.load = async () => {
			await new Promise((r) => setTimeout(r, 2));
			this.innerVal = "inner";
		};
		return jsx("main", {});
	};
	let Outer = function (this: any) {
		this.cx.load = async () => {
			await new Promise((r) => setTimeout(r, 4));
			this.outerVal = "outer";
		};
		return jsx(Inner, {});
	};

	let r = await serverRender(Outer);
	check("the wrapper's load shipped").assertEq(
		r.payload.k.includes("outerVal"),
		true
	);
	check("the wrapped component's load shipped").assertEq(
		r.payload.k.includes("innerVal"),
		true
	);
});

ssrTest("a data component with a load does not crash", async () => {
	let Data: any = function (this: any) {
		this.cx.load = () => {
			this.x = 1;
		};
		return "just a string";
	};
	let App = function () {
		return jsx("main", { children: jsx(Data, {}) });
	};

	let threw: unknown;
	try {
		await serverRender(App);
	} catch (e) {
		threw = e;
	}
	check("render survived").assertEq(threw === undefined, true);
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
