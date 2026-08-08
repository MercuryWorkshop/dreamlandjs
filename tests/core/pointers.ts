import { test, check } from "../harness.ts";

import {
	createState,
	isStateful,
	stateListen,
	stateProxy,
	NO_CHANGE,
} from "dreamland/core";

// Behavioral coverage for the reactive features the consumer apps (browser.js,
// m3-dreamland) exercise but the suite did not previously test: multi-arg/zip use,
// usestr template pointers, .map/.mapEach, two-way .map + NO_CHANGE, and/or/not
// combinators, .value writes, and the stateListen/stateProxy/isStateful surface.

test("zip/multi-arg", () => {
	let state = createState({ a: 1, b: "x", c: true });
	let zipped = use(state.a, state.b, state.c);
	check("zip initial value shape").assertDeepEq(zipped.value, [1, "x", true]);

	let listen = check(
		"zip listener fires with the full tuple on any change"
	).expectCalls(3);
	let expected: any[] = [1, "x", true];
	zipped.listen((v) => listen.assertDeepEq(v, expected));

	expected = [2, "x", true];
	state.a = 2;
	expected = [2, "y", true];
	state.b = "y";
	expected = [2, "y", false];
	state.c = false;
});

test("zip/explicit", () => {
	let state = createState({ a: 1, b: 2 });
	let z = use(state.a).zip(use(state.b));
	check("explicit .zip() value").assertDeepEq(z.value, [1, 2]);

	let listen = check("explicit zip reacts to either source").expectCalls(2);
	let expected: any[] = [1, 2];
	z.listen((v) => listen.assertDeepEq(v, expected));
	expected = [9, 2];
	state.a = 9;
	expected = [9, 8];
	state.b = 8;
});

test("usestr", () => {
	let state = createState({ name: "world", n: 1 });
	let str = use`hello ${state.name} #${state.n}`;
	check("usestr initial value").assertEq(str.value, "hello world #1");

	let listen = check(
		"usestr recomputes when any interpolated pointer changes"
	).expectCalls(2);
	let expected = "hello world #1";
	str.listen(() => listen.assertEq(str.value, expected));

	expected = "hello dl #1";
	state.name = "dl";
	expected = "hello dl #2";
	state.n = 2;
});

test("map/single", () => {
	let state = createState({ n: 2 });
	let mapped = use(state.n).map((x) => x * x);
	check("map initial value").assertEq(mapped.value, 4);

	let listen = check("map recomputes on source change").expectCalls(2);
	let expected = 4;
	mapped.listen((v) => listen.assertEq(v, expected));
	expected = 9;
	state.n = 3;
	expected = 16;
	state.n = 4;
});

test("map/two-way", () => {
	let state = createState({ celsius: 0 });
	let f = use(state.celsius).map(
		(c) => (c * 9) / 5 + 32,
		(fVal) => ((fVal - 32) * 5) / 9
	);
	check("forward map").assertEq(f.value, 32);

	f.value = 212; // reverse runs and writes through to the source
	check("reverse map writes through to source").assertEq(state.celsius, 100);
	check("forward reflects the new source value").assertEq(f.value, 212);
});

test("map/two-way/no-change", () => {
	let state = createState({ x: 5 });
	let clamped = use(state.x).map(
		(x) => x,
		(v) => (v < 0 ? NO_CHANGE : v)
	);

	clamped.value = 10;
	check("valid reverse propagates").assertEq(state.x, 10);

	clamped.value = -1; // reverse returns NO_CHANGE -> propagation blocked
	check("NO_CHANGE blocks reverse propagation").assertEq(state.x, 10);
});

test("combinators/and-or-not", () => {
	let truthy = createState({ on: true, label: "hi" });
	let falsy = createState({ on: false });

	check("and with a value (truthy)").assertEq(
		use(truthy.on).and("Y").value,
		"Y"
	);
	check("and with a function (truthy)").assertEq(
		use(truthy.label).and((s) => s.toUpperCase()).value,
		"HI"
	);
	check("and short-circuits on falsy").assertEq(
		use(falsy.on).and("Y").value,
		false
	);
	check("or returns fallback on falsy").assertEq(
		use(falsy.on).or("fallback").value,
		"fallback"
	);
	check("or passes through truthy").assertEq(
		use(truthy.on).or("fallback").value,
		true
	);
	check("not inverts").assertEq(use(truthy.on).not().value, false);

	let listen = check("and-combined pointer reacts to source").once();
	let p = use(truthy.on).and("ON");
	let expected: any = "ON";
	p.listen((v) => listen.assertEq(v, expected));
	expected = false;
	truthy.on = false;
});

test("mapEach", () => {
	let state = createState({ items: [1, 2, 3] });
	let doubled = use(state.items).mapEach((x) => x * 2);
	check("mapEach initial value").assertDeepEq(doubled.value, [2, 4, 6]);

	let listen = check("mapEach reacts to array replacement").once();
	let expected: number[] = [2, 4, 6];
	doubled.listen((v) => listen.assertDeepEq(v, expected));
	expected = [20, 40];
	state.items = [10, 20];
});

test("value-set", () => {
	let state = createState({ a: 1, nested: createState({ b: 2 }) });

	let pa = use(state.a);
	pa.value = 5;
	check("setting a regular pointer writes through the path").assertEq(
		state.a,
		5
	);

	let pb = use(state.nested.b);
	pb.value = 20;
	check("setting a nested pointer writes through the path").assertEq(
		state.nested.b,
		20
	);

	let listen = check(
		"setting a pointer notifies the source's observers"
	).once();
	let obs = use(state.a);
	obs.listen((v) => listen.assertEq(v, 9));
	use(state.a).value = 9;
});

test("state-api/stateListen", () => {
	let state = createState({ a: 1, b: "x" });
	let listen = check("stateListen fires with (newValue, prop)").expectCalls(2);
	let expected: [any, any] = [2, "a"];
	stateListen(state, (newValue, prop) =>
		listen.assertDeepEq([newValue, prop], expected)
	);

	expected = [2, "a"];
	state.a = 2;
	expected = ["y", "b"];
	state.b = "y";
});

test("state-api/stateProxy", () => {
	let src = createState({ a: 10 });
	let dst = createState({ b: 0 });
	stateProxy(dst, "b", use(src.a));
	check("stateProxy initial read reflects the source").assertEq(dst.b, 10);

	let listen = check("proxied prop notifies the dest state's listeners").once();
	stateListen(dst, (v, prop) => {
		if (prop === "b") listen.assertEq(v, 42);
	});
	src.a = 42;
	check("proxied prop reflects the source update").assertEq(dst.b, 42);
});

test("state-api/isStateful", () => {
	let state = createState({ a: 1 });
	check("isStateful is true for a state").assertEq(isStateful(state), true);
	check("isStateful is false for a plain object").assertEq(
		isStateful({ a: 1 }),
		false
	);
	check("isStateful is false for a primitive").assertEq(
		isStateful(5 as any),
		false
	);
});

test("listener-added-during-dispatch", () => {
	// A pointer registered on (state, prop) from inside a listener that fires for
	// that same (state, prop) must survive the dispatch and react to later changes.
	// Regresses a linked-list clobber: the head was reassigned after dispatch,
	// discarding any node prepended while dispatching.
	let state = createState({ a: 1 });
	let keep: any[] = [];

	let added = check(
		"pointer added mid-dispatch reacts to the next change"
	).once();

	let p1 = use(state.a);
	keep.push(p1);
	let createdOnce = false;
	p1.listen(() => {
		if (createdOnce) return;
		createdOnce = true;
		let p2 = use(state.a);
		keep.push(p2);
		p2.listen((v) => added.assertEq(v, 20));
	});

	state.a = 10; // p1 fires -> registers p2 on state."a" mid-dispatch
	state.a = 20; // p2 must fire here
});

test("stateful-prototype", () => {
	// the StatefulClass pattern from browser.js: createState over an object whose
	// methods live on the prototype, accessed through the proxy.
	let proto = {
		greet(this: { name: string }) {
			return "hi " + this.name;
		},
	};
	let obj: any = Object.create(proto);
	obj.name = "a";
	let state = createState(obj);

	check("prototype method works through the proxy").assertEq(
		state.greet(),
		"hi a"
	);

	let listen = check("prototype-based state is reactive").once();
	let obs = use(state.name);
	obs.listen((v) => listen.assertEq(v, "b"));
	state.name = "b";

	check("method reflects the updated state").assertEq(state.greet(), "hi b");
});
