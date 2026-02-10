import { test, check, checkGC } from "../harness.ts";

import { createState } from "../../dist/core.js";

test("basic", () => {
	let state = createState(
		checkGC("State gets freed", {
			a: 1,
		})
	);

	let target = 1;
	let listenOne = check(
		"Normal listener always gets called with correct value"
	).expectCalls(3);
	checkGC("Pointer1 gets freed", use(state.a))
		.constrain(listenOne)
		.listen(
			checkGC("Normal listener gets freed", (x) =>
				listenOne.assertEq(x, target)
			)
		);
	state.a = target = 2;
	state.a = target = 3;
	state.a = target = 4;
});

test("mapped", () => {
	let state = createState(
		checkGC("State gets freed", {
			a: 1,
		})
	);

	let target = 1;
	let listenMap = check(
		"Mapped listener always gets called with correct value"
	).expectCalls(3);
	checkGC("Pointer2 gets freed", use(state.a))
		.map(checkGC("Mapper gets freed", (x) => "" + x))
		.constrain(listenMap)
		.listen(
			checkGC("Mapped listener gets freed", (x) =>
				listenMap.assertEq(x, "" + target)
			)
		);

	state.a = target = 2;
	state.a = target = 3;
	state.a = target = 4;
});

test("nested", () => {
	let state = createState(
		checkGC("Outer state gets freed", {
			a: createState(
				checkGC("Inner state gets freed", {
					b: "abc",
				})
			),
		})
	);

	let target = "abc";
	let nestedListen = check(
		"Nested state listener always gets called with correct value"
	).expectCalls(3);
	checkGC("Pointer gets freed", use(state.a.b))
		.constrain(state)
		.listen(
			checkGC("Listener gets freed", (x) => nestedListen.assertEq(x, target))
		);

	state.a.b = target = "bcd";
	state.a.b = target = "def";
	state.a.b = target = "ghi";
});

test("nested/dynamic", () => {
	let state = createState(
		checkGC("Outer state gets freed", {
			a: createState(
				checkGC("State A gets freed", {
					val: "abc",
				})
			),
			b: createState(
				checkGC("State B gets freed", {
					val: "bcd",
				})
			),
			val: "a" as "a" | "b",
		})
	);

	let ptr = checkGC("Pointer gets freed", use(state[state.val].val));
	check("Dynamic pointer has correct value before").assertEq(ptr.value, "abc");

	let listen = check("Dynamic pointer listener gets correct value");
	ptr.listen(
		checkGC("Pointer listener gets freed", (x) => listen.assertEq(x, "bcd"))
	);
	state.val = "b";

	check("Dynamic pointer has correct value after").assertEq(ptr.value, "bcd");
});

test("nested/non-stateful", () => {
	let state = createState(
		checkGC("State gets freed", {
			settings: { prop1: "abc" },
			prop1: "123",
		})
	);

	let ptr = checkGC("Pointer gets freed", use(state.settings.prop1));
	check("Dynamic pointer has correct value before").assertEq(ptr.value, "abc");

	let listen = check(
		"Dynamic pointer listener only gets called once state.settings updates"
	).once();
	ptr.listen(
		checkGC("Pointer listener gets freed", (x) => listen.assertEq(x, "bcd"))
	);

	state.prop1 = "456";
	state.settings.prop1 = "def";
	state.settings = { prop1: "bcd" };

	check("Dynamic pointer has correct value after").assertEq(ptr.value, "bcd");
});
