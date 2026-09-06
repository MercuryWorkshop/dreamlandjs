import { jsxTest, shape } from "../harness.ts";
import { check } from "../../harness.ts";
import { createState, jsx } from "../../../dist/core.js";

// counts the DOM mutations the reconciler issues on a specific parent. Needed
// because a broken LIS still produces correct output -- it just reinserts
// everything -- so only op counts can catch it.
let instrument = (el: any) => {
	let counts = { insert: 0, remove: 0 };
	let ib = el.insertBefore.bind(el);
	let rc = el.removeChild.bind(el);
	// the ssr vdom's insertBefore detaches the node first; that internal call
	// isn't a reconciler decision, so don't count it
	let moving = false;
	el.insertBefore = (a: any, b: any) => {
		counts.insert++;
		moving = true;
		try {
			return ib(a, b);
		} finally {
			moving = false;
		}
	};
	el.removeChild = (a: any) => (moving || counts.remove++, rc(a));
	return counts;
};

jsxTest("append-is-one-insert", () => {
	let state = createState({ x: ["a", "b", "c"] as string[] });
	let dom = jsx("div", { children: [use(state.x)] });
	let counts = instrument(dom);

	state.x = ["a", "b", "c", "d"];
	check("appended").assertEq(shape(dom), `!,"a","b","c","d"`);
	check("exactly one insert").assertEq(counts.insert, 1);
	check("nothing removed").assertEq(counts.remove, 0);
});

jsxTest("unchanged-is-noop", () => {
	let state = createState({ x: ["a", "b", "c"] as string[] });
	let dom = jsx("div", { children: [use(state.x)] });
	let counts = instrument(dom);

	state.x = ["a", "b", "c"]; // new array, identical contents
	check("unchanged").assertEq(shape(dom), `!,"a","b","c"`);
	check("no inserts").assertEq(counts.insert, 0);
	check("no removes").assertEq(counts.remove, 0);
});

jsxTest("middle-removal", () => {
	let state = createState({ x: ["a", "b", "c", "d"] as string[] });
	let dom = jsx("div", { children: [use(state.x)] });

	state.x = ["a", "d"];
	check("shape").assertEq(shape(dom), `!,"a","d"`);
});

jsxTest("list-reorder", () => {
	let a = jsx("span", {});
	let b = jsx("span", {});
	let c = jsx("span", {});
	let state = createState({ items: [a, b, c] as any[] });

	let dom = jsx("div", { children: [use(state.items)] });

	check("4 nodes").assertEq(dom.childNodes.length, 4);
	check("a @ 1").assertEq(dom.childNodes[1], a);
	check("b @ 2").assertEq(dom.childNodes[2], b);
	check("c @ 3").assertEq(dom.childNodes[3], c);

	let counts = instrument(dom);
	state.items = [c, a, b];

	check("4 nodes after reorder").assertEq(dom.childNodes.length, 4);
	check("c moved to 1 (same node)").assertEq(dom.childNodes[1], c);
	check("a moved to 2 (same node)").assertEq(dom.childNodes[2], a);
	check("b moved to 3 (same node)").assertEq(dom.childNodes[3], b);
	// the LIS keeps a and b static; only c should be relocated
	check("only one node moved").assertEq(counts.insert, 1);
	check("nothing removed").assertEq(counts.remove, 0);
});
