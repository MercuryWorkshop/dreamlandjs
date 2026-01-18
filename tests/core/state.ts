import { test, check, checkGC } from "../harness.ts";

import { createState } from "../../dist/core.js";

test("basic", () => {
	let state = createState(
		checkGC("State gets freed", {
			a: 1,
			b: 2,
		})
	);

	let listenOne = check("Normal listener gets called with correct value");
	checkGC("Pointer1 gets freed", use(state.a))
		.constrain(listenOne)
		.listen(
			checkGC("Normal listener gets freed", (x) => listenOne.assertEq(x, 2))
		);
	state.a = 2;

	let listenMap = check("Mapped listener gets called with correct value");
	checkGC("Pointer2 gets freed", use(state.b))
		.map(checkGC("Mapper gets freed", (x) => "" + x))
		.constrain(listenMap)
		.listen(
			checkGC("Mapped listener gets freed", (x) => listenMap.assertEq(x, "3"))
		);
	state.b = 3;
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

	let nestedListen = check("Nested state listener gets called");
	checkGC("Pointer gets freed", use(state.a.b))
		.constrain(state)
		.listen(checkGC("Listener gets freed", () => nestedListen.pass()));
	state.a.b = "bcd";
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

	let ptr = use(state[state.val].val);
	check("Dynamic pointer has correct value before").assertEq(ptr.value, "abc");

	let listen = check("Dynamic pointer listener gets correct value");
	ptr.listen(
		checkGC("Pointer listener gets freed", (x) => listen.assertEq(x, "bcd"))
	);
	state.val = "b";

	check("Dynamic pointer has correct value after").assertEq(ptr.value, "bcd");
});
