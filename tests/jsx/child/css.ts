import { jsxTest, ownClasses } from "../harness.ts";
import { check } from "../../harness.ts";
import { createState, css, jsx } from "../../../dist/core.js";

// --- css ident application to children -----------------------------------------
//
// the scope ident and the `dlc` component marker are attributes, not classes, so
// they share no namespace with user-controlled `class` bindings

let identOf = (el: any) =>
	el.getAttributeNames().find((c: string) => c.startsWith("dlcss-"));
let hasIdent = (el: any) => !!identOf(el);

jsxTest("ident-on-children", () => {
	let Styled = function (this: any) {
		return jsx("div", { children: this.children });
	} as any;
	Styled.style = css`
		color: red;
	`;

	// created in plain scope, so neither carries a css ident yet; the grandchild
	// exercises applyIdent's recursion into descendant elements
	let grandchild = jsx("b", {});
	let orphan = jsx("section", { children: [grandchild] });
	let dom = jsx(Styled, { children: [orphan] });

	check("component root marked").assertEq(
		(dom as any).hasAttribute("dlc"),
		true
	);
	check("child element inherits the component's css ident").assertEq(
		hasIdent(orphan),
		true
	);
	check("descendant element inherits it too (recursion)").assertEq(
		hasIdent(grandchild),
		true
	);
});

jsxTest("ident-is-dom-normalized", () => {
	// the ident is an attribute *name*, and setAttribute lowercases those on html
	// elements. applyIdent reads names back out of getAttributeNames to decide
	// whether a child is already stamped and by whom, so an ident that is not
	// already lowercase never compares equal to the one sitting on the element --
	// and component names are conventionally PascalCase, so it never would be
	let PascalCase = function (this: any) {
		return jsx("div", { children: [jsx("span", {})] });
	} as any;
	PascalCase.style = css`
		color: red;
	`;

	let dom: any = jsx(PascalCase, {});
	let id: string = dom.$.id;

	check("the generated ident needs no normalizing").assertEq(
		id,
		id.toLowerCase()
	);
	check("root is stamped under exactly that name").assertEq(identOf(dom), id);
	check("and so is a child applyIdent walked to").assertEq(
		identOf(dom.childNodes[0]),
		id
	);
});

jsxTest("skips-nested-component", () => {
	// a styled child component's subtree must NOT be re-stamped by the parent's
	// ident -- applyIdent bails on any element carrying the component marker
	let Child = function (this: any) {
		return jsx("span", {});
	} as any;
	Child.style = css`
		color: blue;
	`;
	let Parent = function (this: any) {
		return jsx("div", { children: [jsx(Child, {})] });
	} as any;
	Parent.style = css`
		color: red;
	`;

	let dom = jsx(Parent, {});
	let parentIdent = identOf(dom);
	let childRoot = dom.childNodes[0] as any;

	check("nested component root is a component").assertEq(
		childRoot.hasAttribute("dlc"),
		true
	);
	check("parent ident exists").assertEq(!!parentIdent, true);
	check("nested component is NOT re-stamped with the parent ident").assertEq(
		childRoot.hasAttribute(parentIdent),
		false
	);
});

// --- idents stamped from outside the owning _jsx call ---------------------------
//
// these are what keeps the ident out of classList. `lastClassList` is the "someone
// else owns classes here" flag, and it is a closure local of the _jsx call that
// built the element -- only that call's own `class:` toggles ever set it. applyIdent
// is a third writer running from the *parent's* _jsx, so it can never arm the flag,
// and back when the ident was a class a later `class` update took the wholesale
// `classList.value = val` path and dropped it. The element kept rendering, it just
// silently stopped being styled.
//
// the shape is reachable whenever an element got no ident of its own, i.e.
// currentComponentCx was unset when it was built -- which is every element built
// inside a pointer listener, since only delegates restore that context.

jsxTest("ident-survives-external-stamp", () => {
	// built outside any component, so no ident of its own and the fastpath stays armed
	let state = createState({ c: "a" });
	let orphan: any = jsx("section", { class: use(state.c) });

	let Styled = function (this: any) {
		return jsx("div", { children: this.children });
	} as any;
	Styled.style = css`
		color: red;
	`;
	jsx(Styled, { children: [orphan] });

	check("applyIdent stamped it").assertEq(hasIdent(orphan), true);
	state.c = "b";
	check("class updated").assertEq(ownClasses(orphan), "b");
	check("ident survives the class update").assertEq(hasIdent(orphan), true);
});

jsxTest("ident-survives-pointer-stamp", () => {
	// same, but stamped through the identOverride path rather than the plain one
	let state = createState({ c: "a", show: true });
	let orphan: any = jsx("section", { class: use(state.c) });

	let Styled = function (this: any) {
		return jsx("div", { children: use(state.show).and(orphan) });
	} as any;
	Styled.style = css`
		color: red;
	`;
	jsx(Styled, {});

	check("pointer child stamped").assertEq(hasIdent(orphan), true);
	state.c = "b";
	check("ident survives the class update").assertEq(hasIdent(orphan), true);
});

jsxTest("ident-survives-stamp-in-list", () => {
	// the shape this actually shows up as: rows rebuilt by a list update are built
	// inside a pointer listener, so they never get an ident from their own _jsx
	let state = createState({ items: [1], c: "a" });
	let rows: any[] = [];

	let List = function () {
		return jsx("div", {
			children: use(state.items).mapEach(() => {
				let row = jsx("li", { class: use(state.c) });
				rows.push(row);
				return row;
			}),
		});
	} as any;
	List.style = css`
		color: red;
	`;

	jsx(List, {});
	state.items = [1, 2];

	let row = rows[rows.length - 1];
	check("rebuilt row stamped").assertEq(hasIdent(row), true);
	state.c = "b";
	check("ident survives the class update").assertEq(hasIdent(row), true);
});

// --- component ownership matrix -------------------------------------------------
//
// formalized from the manual colour-check repro in dl-test. an element is *owned*
// by the component whose body lexically created it, never by the component it ends
// up nested inside -- so slotted children keep the slotting component's ident and
// are not restyled by their host. covers the four ways an element can arrive:
// written in the body, produced by a pointer, slotted in, and slotted in through
// a pointer, each at two nesting depths.

// every test element carries `w<N>` naming its expected owner, plus a unique label
let walkTagged = (el: any, out: any[] = []) => {
	if (!el.classList) return out;
	if ([...el.classList].some((c: string) => /^w\d$/.test(c))) out.push(el);
	el.childNodes.forEach((c: any) => walkTagged(c, out));
	return out;
};

jsxTest("ownership-matrix", () => {
	let state = createState({ ref: 0 });
	let mk = (label: string, owner: number) =>
		jsx("div", { class: `${label} w${owner}` });
	let mkDyn = (label: string, owner: number) =>
		use(state.ref).map(() => mk(label, owner));

	let box1: any, box2: any;

	let Box2 = function (this: any) {
		return jsx("div", {
			children: [mk("box2-own", 2), mkDyn("box2-own-dyn", 2), this.children],
		});
	} as any;
	Box2.style = css`
		color: green;
	`;

	let Box1 = function (this: any) {
		return jsx("div", {
			children: [mk("box1-own", 1), mkDyn("box1-own-dyn", 1), this.children],
		});
	} as any;
	Box1.style = css`
		color: blue;
	`;

	let Root = function () {
		return jsx("div", {
			children: [
				mk("root-own", 0),
				mkDyn("root-own-dyn", 0),
				(box1 = jsx(Box1, {
					children: [
						// written in Root's body, so Box1 must not claim them
						mk("root-slotted", 0),
						mkDyn("root-slotted-dyn", 0),
						(box2 = jsx(Box2, { children: [mk("root-slotted-deep", 0)] })),
					],
				})),
			],
		});
	} as any;
	Root.style = css`
		color: red;
	`;

	let dom: any = jsx(Root, {});
	// read from each cx rather than off the dom, so every comparison below is the
	// ident the library generated against the one the dom actually stored
	let owners = () => [dom.$.id, box1.$.id, box2.$.id];

	check("the three components have distinct idents").assertEq(
		new Set(owners()).size,
		3
	);

	let mismatches = () => {
		let want = owners();
		return (
			walkTagged(dom)
				.map((el: any) => {
					let classes = [...el.classList];
					let label = classes.find(
						(c: string) => !c.startsWith("dlcss-") && !/^w\d$/.test(c)
					);
					let n = +classes.find((c: string) => /^w\d$/.test(c))!.slice(1);
					return identOf(el) === want[n]
						? null
						: `${label}: want w${n} (${want[n]}) got ${identOf(el) || "(none)"}`;
				})
				.filter(Boolean)
				.join("\n  ") || "none"
		);
	};

	// a broken walk would make the mismatch check vacuously pass
	check("all nine tagged elements found").assertEq(walkTagged(dom).length, 9);
	check("every element is owned by the component that wrote it").assertEq(
		mismatches(),
		"none"
	);

	// the pointer-built elements are rebuilt outside any component context, so this
	// is the half that exercises identOverride rather than the stamp in _jsx
	state.ref = 1;
	check("still nine after a rebuild").assertEq(walkTagged(dom).length, 9);
	check("ownership survives a pointer rebuild").assertEq(mismatches(), "none");
});

// --- the two ways ownership is *not* the renderer --------------------------------
//
// the matrix above is written entirely inside component bodies, so every element in
// it has an owner and every pointer in it has one too. these are the two shapes
// where that does not hold: an element built with no component context (which has to
// fall back to whoever renders it) and an element built by one component but
// rendered by another (which has to keep the ident it already has). both arrive
// through the same mapChild walk, and it has to answer them differently.

jsxTest("ident-falls-back-for-an-unowned-pointer", () => {
	// built out here rather than in a body, so there is no cx to capture and nothing
	// to inherit; the map runs unowned on every read, initial and rebuild alike
	let state = createState({ n: 0 });
	let ptr = use(state.n).map(() => jsx("li", {}));

	let Styled = function () {
		return jsx("ul", { children: [ptr] });
	} as any;
	Styled.style = css`
		color: red;
	`;

	let dom: any = jsx(Styled, {});
	let id: string = dom.$.id;

	check("content adopts the ident of the component rendering it").assertEq(
		identOf(dom.childNodes[1]),
		id
	);

	// the rebuild is the half that matters: the pointer has no cx to restore, so
	// without the walk's own ident the row comes back unstamped and stops matching
	state.n = 1;
	check("and keeps it across a rebuild").assertEq(
		identOf(dom.childNodes[1]),
		id
	);
});

jsxTest("a-map-is-owned-where-it-is-written", () => {
	// what a map builds belongs to the body the callback was written in, which is the
	// cx `.map()` captured -- not the cx of the pointer it reads from. those are the
	// same thing for `use(x).map(f)` written in one go, and only come apart once the
	// source pointer is handed across a component boundary
	let state = createState({ n: 0 });
	let src: any;

	let Src = function () {
		src = use(state.n);
		return jsx("i", {});
	} as any;
	Src.style = css`
		color: green;
	`;
	let source: any = jsx(Src, {});

	// written in Mapper's body, so Mapper owns the row even though Src owns the source
	let Mapper = function () {
		return jsx("div", { children: [src.map(() => jsx("span", {}))] });
	} as any;
	Mapper.style = css`
		color: red;
	`;
	let mapper: any = jsx(Mapper, {});

	// written out here with no cx to capture, so it falls back to whoever renders it
	let unowned = src.map(() => jsx("span", {}));
	let Renderer = function () {
		return jsx("div", { children: [unowned] });
	} as any;
	Renderer.style = css`
		color: blue;
	`;
	let renderer: any = jsx(Renderer, {});

	let row = (dom: any) => identOf(dom.childNodes[1]);

	check("the three components have distinct idents").assertEq(
		new Set([source.$.id, mapper.$.id, renderer.$.id]).size,
		3
	);
	check("a map written in a body is owned by that body").assertEq(
		row(mapper),
		mapper.$.id
	);
	check("and not by the owner of the pointer it reads").assertEq(
		row(mapper) === source.$.id,
		false
	);
	check("an unowned map is adopted by the component rendering it").assertEq(
		row(renderer),
		renderer.$.id
	);

	// the rebuild reads through the same getter, so it has to answer the same way
	state.n = 1;
	check("ownership survives a rebuild").assertEq(row(mapper), mapper.$.id);
	check("adoption survives a rebuild").assertEq(row(renderer), renderer.$.id);
});

jsxTest("foreign-element-keeps-its-owner", () => {
	// built inside Owner, so Owner stamped it -- but never attached there
	let held: any;
	let Owner = function () {
		held = jsx("span", {});
		return jsx("i", {});
	} as any;
	Owner.style = css`
		color: green;
	`;
	let owner: any = jsx(Owner, {});

	// handed to a second component through a pointer that Renderer owns. the pointer
	// is the renderer's, the element is not, and the element wins
	let state = createState({ v: 0 });
	let Renderer = function () {
		return jsx("div", { children: [use(state.v).map(() => held)] });
	} as any;
	Renderer.style = css`
		color: red;
	`;
	let dom: any = jsx(Renderer, {});

	check("the two components have distinct idents").assertEq(
		owner.$.id === dom.$.id,
		false
	);
	check("Owner stamped it when it was built").assertEq(
		identOf(held),
		owner.$.id
	);
	check("rendering it elsewhere does not re-stamp it").assertEq(
		identOf(dom.childNodes[1]),
		owner.$.id
	);
	check("and it is not the renderer's").assertEq(
		identOf(dom.childNodes[1]) === dom.$.id,
		false
	);
});
