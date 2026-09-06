import { jsxTest, ownClasses } from "../harness.ts";
import { check } from "../../harness.ts";
import { createState, css, jsx } from "../../../dist/core.js";

jsxTest("updates-under-a-css-ident", () => {
	// the ident used to be a class, which put a second writer into classList and
	// forced every `class` update through the remove-then-add path. now that it is
	// an attribute, `class` owns classList outright and takes the wholesale path --
	// which still has to replace what the previous write left, not pile onto it
	let state = createState({ c: "a" });
	let Styled = function () {
		return jsx("div", { class: use(state.c) });
	} as any;
	Styled.style = css`
		color: red;
	`;

	let dom: any = jsx(Styled, {});
	check("initial class applied").assertEq(ownClasses(dom), "a");
	state.c = "b";
	check("the previous class is removed, not accumulated").assertEq(
		ownClasses(dom),
		"b"
	);
});

jsxTest("coexists-with-toggles", () => {
	// `class` may only ever remove what `class` itself added -- classes owned by
	// `class:` bindings have to survive an unrelated `class` update
	let state = createState({ c: "a", x: true, y: true });
	let dom: any = jsx("div", {
		class: use(state.c),
		"class:x": use(state.x),
		"class:y": use(state.y),
	});
	check("class and both toggles applied").assertEq(ownClasses(dom), "a x y");

	state.c = "b";
	check("toggles survive a class update").assertEq(ownClasses(dom), "b x y");

	state.x = false;
	check("a toggle still turns off").assertEq(ownClasses(dom), "b y");

	state.c = "c";
	check("class update after a toggle change").assertEq(ownClasses(dom), "c y");
});

jsxTest("toggle-before-class", () => {
	// attr order is prop order: here classList is already dirty by the time the
	// `class` handler first runs, so it takes the dirty path with nothing to remove
	let state = createState({ c: "a", x: true });
	let dom: any = jsx("div", { "class:x": use(state.x), class: use(state.c) });
	check("both applied").assertEq(ownClasses(dom), "a x");

	state.c = "b";
	check("toggle survives").assertEq(ownClasses(dom), "b x");
});
