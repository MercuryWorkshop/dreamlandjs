import { test, check, checkAlive, collectGarbage } from "../harness.ts";

import { createState, stateProxy } from "../../dist/core.js";

// These tests model the real-world contract: a LONG-LIVED state (an app store, a
// settings singleton) is observed by SHORT-LIVED pointers/listeners owned by
// components. When a component's constraint owner is dropped, every pointer-related
// object must be reclaimed, while the state itself survives. There are no teardown
// hooks — cleanup is entirely GC-driven via the `constrain` anchor.
//
// To keep a state alive past the end-of-test GC we constrain a long-lived observer
// pointer to a `check()` (the harness retains checks for the whole test); this
// models an app-level observer. Short-lived graphs are built inside an inner scope
// so that, once it returns, only WeakRefs remain and `collectGarbage()` can reclaim
// them deterministically.

test("gc/constrain-release", async () => {
	// `live` both anchors the long-lived state AND carries the behavioral assertion
	let live = check(
		"dead listener is not re-invoked after the pointer is freed"
	);
	let state = createState({ x: 0 });
	use(state.x).constrain(live); // long-lived observer keeps `state` reachable
	checkAlive("long-lived state stays alive after its pointer is freed", state);

	let calls = 0;
	let refs = (() => {
		let owner = {}; // stand-in for a component's cx.state / root DOM node
		let listener = (_v: number) => {
			calls++;
		};
		let ptr = use(state.x).constrain(owner);
		ptr.listen(listener);
		return {
			owner: new WeakRef(owner),
			ptr: new WeakRef(ptr),
			listener: new WeakRef(listener),
		};
	})();

	state.x = 1; // fires the long-lived observer + the short-lived listener
	check("short-lived listener fired while constrained").assertEq(calls, 1);

	await collectGarbage();

	check("constraint owner is freed").assertEq(refs.owner.deref(), undefined);
	check("pointer is freed once its owner is dropped").assertEq(
		refs.ptr.deref(),
		undefined
	);
	check("listener is freed with its pointer").assertEq(
		refs.listener.deref(),
		undefined
	);

	let before = calls;
	state.x = 2; // dead weak listener must be purged, not invoked
	live.assertEq(calls, before);
});

test("gc/unconstrain", async () => {
	// the Tab.tsx pattern: constrain then unconstrain mid-life. After unconstrain,
	// the pointer must be collectible even though its owner is still alive.
	let state = createState({ x: 0 });
	let owner = {}; // stays alive (referenced after the GC)
	let ptrRef = (() => {
		let ptr = use(state.x).constrain(owner);
		ptr.unconstrain(owner);
		return new WeakRef(ptr);
	})();

	await collectGarbage();

	check("owner is still alive").assertEq(!!owner && typeof owner, "object");
	check("pointer is freed after unconstrain despite a live owner").assertEq(
		ptrRef.deref(),
		undefined
	);
});

test("gc/derived-chain-release", async () => {
	let live = check(
		"source state is still reactive after derived chain is freed"
	);
	let state = createState({ a: 1, b: 2 });
	use(state.a).constrain(live); // anchor keeps `state` reachable
	checkAlive(
		"source state stays alive while derived pointers are freed",
		state
	);

	let refs = (() => {
		let owner = {};
		let mapFn = (x: number) => x * 10;
		let mapped = use(state.a).map(mapFn).constrain(owner);
		let zipped = use(state.a, state.b).constrain(owner);
		let combined = use(state.a).and("yes").constrain(owner);
		let str = use`a=${state.a} b=${state.b}`.constrain(owner); // usestr
		return {
			owner: new WeakRef(owner),
			mapped: new WeakRef(mapped),
			mapFn: new WeakRef(mapFn),
			zipped: new WeakRef(zipped),
			combined: new WeakRef(combined),
			str: new WeakRef(str),
		};
	})();

	state.a = 5; // exercise the whole derived graph

	await collectGarbage();

	check("mapped pointer is freed").assertEq(refs.mapped.deref(), undefined);
	check("map function is freed with its pointer").assertEq(
		refs.mapFn.deref(),
		undefined
	);
	check("zipped pointer is freed").assertEq(refs.zipped.deref(), undefined);
	check("and-combined pointer is freed").assertEq(
		refs.combined.deref(),
		undefined
	);
	check("usestr pointer (and its internal state) is freed").assertEq(
		refs.str.deref(),
		undefined
	);
	check("constraint owner is freed").assertEq(refs.owner.deref(), undefined);

	// source still reacts via a fresh observer
	let fresh = use(state.a);
	let got = -1;
	fresh.listen((v) => (got = v));
	state.a = 7;
	live.assertEq(got, 7);
});

test("gc/multi-owner", async () => {
	let state = createState({ x: 0 });
	let owner2: object | null = {}; // second owner, kept alive across phase 1
	let ptrRef = (() => {
		let owner1 = {};
		let ptr = use(state.x).constrain(owner1).constrain(owner2!);
		return new WeakRef(ptr);
	})();

	await collectGarbage();
	check("pointer stays alive while one owner remains").assertEq(
		!!ptrRef.deref(),
		true
	);

	owner2 = null; // drop the last remaining owner
	await collectGarbage();
	check("pointer is freed once all owners are dropped").assertEq(
		ptrRef.deref(),
		undefined
	);
});

test("gc/repeated-mount", async () => {
	// many short-lived constrained pointers churn against one long-lived state;
	// none may leak, and the state's dead weak-listeners must be purged.
	let live = check("long-lived state has no stale listeners after churn");
	let state = createState({ x: 0 });
	use(state.x).constrain(live);
	checkAlive("long-lived state survives mount/unmount churn", state);

	let N = 25;
	let refs: WeakRef<object>[] = [];
	let calls = 0;
	for (let i = 0; i < N; i++) {
		(() => {
			let owner = {};
			let listener = () => {
				calls++;
			};
			let ptr = use(state.x).constrain(owner);
			ptr.listen(listener);
			refs.push(new WeakRef(ptr), new WeakRef(listener), new WeakRef(owner));
		})();
	}

	state.x = 1; // every mounted listener fires exactly once
	check("all mounted listeners fired").assertEq(calls, N);

	await collectGarbage();
	let aliveCount = refs.filter((r) => r.deref()).length;
	check("every mounted pointer/listener/owner is freed").assertEq(
		aliveCount,
		0
	);

	let before = calls;
	state.x = 2; // only the long-lived observer remains
	live.assertEq(calls, before);
});

test("gc/dynamic-path-rewire", async () => {
	let live = check("dynamic pointer tracks the active branch after rewire");
	let state = createState({
		a: createState({ val: "A" }),
		b: createState({ val: "B" }),
		which: "a" as "a" | "b",
	});
	let dyn = use(state[state.which].val).constrain(live);
	checkAlive("dynamic pointer stays alive (constrained)", dyn);
	check("dynamic value before swap").assertEq(dyn.value, "A");

	let oldARef = new WeakRef(state.a as object); // capture original branch a
	state.which = "b"; // rewire: detaches the weak listener from branch a
	check("dynamic value after swap").assertEq(dyn.value, "B");

	state.a = createState({ val: "A2" }); // drop the last reference to old branch a

	await collectGarbage();
	check("old branch-a state is collectible after rewire + replace").assertEq(
		oldARef.deref(),
		undefined
	);

	state.b.val = "B2"; // pointer still tracks the active branch
	live.assertEq(dyn.value, "B2");
});

test("gc/stateProxy-lifecycle", async () => {
	// stateProxy intentionally ties source <-> dest lifetimes (the proxied prop is
	// part of the dest state). The whole group must be collectible together.
	let srcRef: WeakRef<object>;
	let dstRef: WeakRef<object>;
	(() => {
		let src = createState({ a: 10 });
		let dst = createState({ b: 0 });
		stateProxy(dst, "b", use(src.a));
		check("proxied read reflects the source").assertEq((dst as any).b, 10);
		(src as any).a = 99;
		check("proxied read updates on source change").assertEq((dst as any).b, 99);
		srcRef = new WeakRef(src);
		dstRef = new WeakRef(dst);
	})();

	await collectGarbage();
	check("proxied source is collected when the group is dropped").assertEq(
		srcRef!.deref(),
		undefined
	);
	check("proxied dest is collected when the group is dropped").assertEq(
		dstRef!.deref(),
		undefined
	);
});
