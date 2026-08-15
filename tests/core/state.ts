import { test, check, checkAlive, checkFreed } from "../harness.ts";

import { createState } from "../../dist/core.js";

test("basic", () => {
	// the pointer is constrained to `listenOne`, which the harness keeps alive for
	// the whole test (it lives in currentTest.checks), so everything stays reachable.
	let state = createState(
		checkAlive("State stays alive while pointer constrained", {
			a: 1,
		})
	);

	let target = 1;
	let listenOne = check(
		"Normal listener always gets called with correct value"
	).expectCalls(3);
	checkAlive("Pointer1 stays alive", use(state.a))
		.constrain(listenOne)
		.listen(
			checkAlive("Normal listener stays alive", (x) =>
				listenOne.assertEq(x, target)
			)
		);
	state.a = target = 2;
	state.a = target = 3;
	state.a = target = 4;
});

test("mapped", () => {
	let state = createState(
		checkAlive("State stays alive", {
			a: 1,
		})
	);

	let target = 1;
	let listenMap = check(
		"Mapped listener always gets called with correct value"
	).expectCalls(3);
	checkAlive("Pointer2 stays alive", use(state.a))
		.map(checkAlive("Mapper stays alive", (x) => "" + x))
		.constrain(listenMap)
		.listen(
			checkAlive("Mapped listener stays alive", (x) =>
				listenMap.assertEq(x, "" + target)
			)
		);

	state.a = target = 2;
	state.a = target = 3;
	state.a = target = 4;
});

test("nested", () => {
	// the pointer is only constrained to `state` itself (a self-referential cycle
	// with no external live owner), so once the test returns the whole graph is
	// unreachable and must be collected.
	let state = createState(
		checkFreed("Outer state gets freed", {
			a: createState(
				checkFreed("Inner state gets freed", {
					b: "abc",
				})
			),
		})
	);

	let target = "abc";
	let nestedListen = check(
		"Nested state listener always gets called with correct value"
	).expectCalls(3);
	checkFreed("Pointer gets freed", use(state.a.b))
		.constrain(state)
		.listen(
			checkFreed("Listener gets freed", (x) => nestedListen.assertEq(x, target))
		);

	state.a.b = target = "bcd";
	state.a.b = target = "def";
	state.a.b = target = "ghi";
});

test("nested/dynamic", () => {
	// no constraint owner at all, so everything is collected once the test returns.
	let state = createState(
		checkFreed("Outer state gets freed", {
			a: createState(
				checkFreed("State A gets freed", {
					val: "abc",
				})
			),
			b: createState(
				checkFreed("State B gets freed", {
					val: "bcd",
				})
			),
			val: "a" as "a" | "b",
		})
	);

	let ptr = checkFreed("Pointer gets freed", use(state[state.val].val));
	check("Dynamic pointer has correct value before").assertEq(ptr.value, "abc");

	let listen = check("Dynamic pointer listener gets correct value");
	ptr.listen(
		checkFreed("Pointer listener gets freed", (x) => listen.assertEq(x, "bcd"))
	);
	state.val = "b";

	check("Dynamic pointer has correct value after").assertEq(ptr.value, "bcd");
});

test("nested/non-stateful", () => {
	let state = createState(
		checkFreed("State gets freed", {
			settings: { prop1: "abc" },
			prop1: "123",
		})
	);

	let ptr = checkFreed("Pointer gets freed", use(state.settings.prop1));
	check("Dynamic pointer has correct value before").assertEq(ptr.value, "abc");

	let listen = check(
		"Dynamic pointer listener only gets called once state.settings updates"
	).once();
	ptr.listen(
		checkFreed("Pointer listener gets freed", (x) => listen.assertEq(x, "bcd"))
	);

	state.prop1 = "456";
	state.settings.prop1 = "def";
	state.settings = { prop1: "bcd" };

	check("Dynamic pointer has correct value after").assertEq(ptr.value, "bcd");
});
