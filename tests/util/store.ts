import { test, check } from "../harness.ts";

import { createState } from "../../dist/core.js";
import {
	serializeState,
	deserializeState,
	createStore,
} from "../../dist/util.js";

test("serialize/basic", () => {
	let obj = {
		a: false,
		b: 0,
		c: null,
		d: "d",
		e: {
			one: "1",
			two: 2,
			three: "three",
		},
	};
	let serialized = serializeState(createState(obj));
	check("serializeState serializes to expected value").assertEq(
		serialized,
		JSON.stringify(obj)
	);
	let deserialized = deserializeState(serialized);
	check("deserializeState deserializes to expected value").assertDeepEq(
		deserialized,
		obj
	);
});

test("serialize/nested", () => {
	let obj = createState({
		a: createState({
			a: "A",
			b: "B",
			c: "cee",
		}),
		b: "bee",
		c: "dee",
	});
	let serializedTarget = {
		a: {
			__dls_ty: "s",
			v: {
				a: "A",
				b: "B",
				c: "cee",
			},
		},
		b: "bee",
		c: "dee",
	};
	let serialized = serializeState(obj);
	check("serializeState serializes to expected value").assertEq(
		serialized,
		JSON.stringify(serializedTarget)
	);
	let deserialized = deserializeState(serialized);
	check("deserializeState deserializes to expected value").assertDeepEq(
		deserialized,
		obj
	);
});

test("localstorage/basic", async () => {
	let store = createStore(
		{
			a: "a",
			b: 1,
			c: true,
		},
		{ backing: "localstorage", ident: "test", autosave: "auto" }
	);

	store.a = "b";
	await Promise.resolve();

	check("store backing has expected value").assertEq(
		localStorage["dls-test"],
		serializeState(store)
	);
});
