import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { transform } from "lightningcss";
import { test, check } from "../harness.ts";
import { CSS_COMPONENT, rewriteSelector } from "../../src/core/css/scope.ts";

// short and unlike anything in the wpt fixture, so expected selectors stay readable
const TAG = "T";

interface WptSelector {
	name: string;
	selector: string;
	expect: string[];
}

let wpt = (file: string) =>
	readFileSync(new URL(`./wpt/${file}`, import.meta.url), "utf8");
let corpus: WptSelector[] = JSON.parse(wpt("selectors.json"));

// the fragment matters: the corpus covers :target
let fixture = () => {
	let win = new Window({ url: "http://localhost/#target" });
	win.document.write(wpt("content.html"));
	return win.document;
};

// does a real css parser accept this selector? happy-dom's engine is lenient and
// will quietly match *something* for input a browser would reject outright, which
// would hide exactly the failure mode we care about: an unparseable selector makes
// the browser drop the whole rule
let parses = (selector: string) => {
	try {
		transform({
			filename: "scope.css",
			code: Buffer.from(`${selector}{color:red}`),
			errorRecovery: false,
		});
		return true;
	} catch {
		return false;
	}
};

// checks report the whole failing set at once -- one check per invariant rather
// than one per selector keeps a regression from burying the run in output
let none = (failures: string[]) => failures.join("\n  ") || "none";

test("css/scope: wpt corpus is an identity transform in scope", () => {
	let doc = fixture();
	let all = [...doc.querySelectorAll("*")] as any[];
	let setScope = (on: boolean) =>
		all.forEach((e) => (on ? e.setAttribute(TAG, "") : e.removeAttribute(TAG)));
	let ids = (list: any) => [...list].map((e: any) => e.id).join(",");

	let changed: string[] = [];
	let leaked: string[] = [];
	let unsupported: string[] = [];

	for (let t of corpus) {
		setScope(true);

		let base: string;
		try {
			base = ids(doc.querySelectorAll(t.selector));
		} catch {
			// happy-dom does not implement all of selectors level 4. comparing the
			// rewrite against the engine's own reading of the original -- rather than
			// against the upstream `expect` -- keeps engine gaps from reading as
			// scoper bugs; there is just nothing to compare when it cannot parse
			unsupported.push(t.selector);
			continue;
		}

		let out = rewriteSelector(t.selector, TAG);

		// with [T] on every element, :where([T]) is satisfied everywhere and adds no
		// specificity, so the rewrite has to select exactly what it started with
		let got: string;
		try {
			got = ids(doc.querySelectorAll(out));
		} catch {
			changed.push(`${t.selector}\n    -> ${out}\n    (engine rejected)`);
			continue;
		}
		if (got !== base) {
			changed.push(
				`${t.selector}\n    -> ${out}\n    want ${base || "(none)"}\n    got  ${got || "(none)"}`
			);
			continue;
		}

		// and with [T] on nothing, it has to select nothing. this is the half that
		// catches a *missing* scope selector: under-scoping only ever over-matches, so
		// it is invisible to the check above
		setScope(false);
		let escapes = ids(doc.querySelectorAll(out));
		if (escapes)
			leaked.push(
				`${t.selector}\n    -> ${out}\n    escapes to ${escapes.slice(0, 80)}`
			);
	}

	let tested = corpus.length - unsupported.length;
	check(`${tested} selectors unchanged with everything in scope`).assertEq(
		none(changed),
		"none"
	);
	check(`${tested} selectors match nothing with nothing in scope`).assertEq(
		none(leaked),
		"none"
	);
	// a guard on the guard: if an engine upgrade starts skipping most of the
	// corpus, the two checks above would pass while testing almost nothing
	check(`happy-dom parsed ${tested}/${corpus.length} of the corpus`).assertEq(
		unsupported.length < 20,
		true
	);
});

test("css/scope: wpt corpus stays valid css after rewriting", () => {
	let invalid: string[] = [];
	let unsupported: string[] = [];

	for (let t of corpus) {
		if (!parses(t.selector)) {
			unsupported.push(t.selector);
			continue;
		}
		let out = rewriteSelector(t.selector, TAG);
		if (!parses(out)) invalid.push(`${t.selector}\n    -> ${out}`);
	}

	let tested = corpus.length - unsupported.length;
	check(`${tested} rewritten selectors parse`).assertEq(none(invalid), "none");
	check(
		`lightningcss parsed ${tested}/${corpus.length} of the corpus`
	).assertEq(unsupported.length < 20, true);
});

test("css/scope: scope selector placement", () => {
	let cases: [string, string][] = [
		// every compound is scoped, not just the subject -- otherwise a selector
		// reaches through into a child component's subtree
		[".a", ".a:where([T])"],
		["div", "div:where([T])"],
		["*", "*:where([T])"],
		[".a .b", ".a:where([T]) .b:where([T])"],
		[".a>.b", ".a:where([T])>.b:where([T])"],
		[".a  >  .b", ".a:where([T])>.b:where([T])"],
		[".a+.b~.c d", ".a:where([T])+.b:where([T])~.c:where([T]) d:where([T])"],
		[".a, .b", ".a:where([T]),.b:where([T])"],
		["a:hover", "a:hover:where([T])"],

		// nothing may follow a pseudo-element, so the scope selector goes in front of one
		[".a::before", ".a:where([T])::before"],
		[".a::first-line::before", ".a:where([T])::first-line::before"],
		["::slotted(.x)", ":where([T])::slotted(.x)"],
		[".a::part(x)", ".a:where([T])::part(x)"],

		// arguments that are selector lists get rewritten...
		[".a:not(.b)", ".a:not(.b:where([T])):where([T])"],
		[".a:is(.b, .c)", ".a:is(.b:where([T]),.c:where([T])):where([T])"],
		[".a:has(> .b)", ".a:has(>.b:where([T])):where([T])"],

		// ...and arguments that are not, are left exactly alone
		["li:nth-child(odd)", "li:nth-child(odd):where([T])"],
		["li:nth-child(2n+1)", "li:nth-child(2n+1):where([T])"],
		["li:nth-last-child(-n+3)", "li:nth-last-child(-n+3):where([T])"],
		["tr:nth-of-type(even)", "tr:nth-of-type(even):where([T])"],
		[":dir(rtl)", ":dir(rtl):where([T])"],
		[":lang(en-US)", ":lang(en-US):where([T])"],

		// separators and colons inside attribute values and escapes are literal
		['[data-x="a, b"]', '[data-x="a, b"]:where([T])'],
		['a[href="a>b"]::after', 'a[href="a>b"]:where([T])::after'],
		["input[type=text]", "input[type=text]:where([T])"],
		[".a\\:b", ".a\\:b:where([T])"],

		// bracket matching indexes by code unit. an astral character in a class name
		// or attribute value is two of those, and walking by code point instead
		// would return an offset that slices the closing bracket off
		['[data-x="\u{1F600}"]', '[data-x="\u{1F600}"]:where([T])'],
		["\u{1F600}", "\u{1F600}:where([T])"],
		[".a[x=\u{1F600}] .b", ".a[x=\u{1F600}]:where([T]) .b:where([T])"],
		[
			":is(.\u{1F600}, .b)",
			":is(.\u{1F600}:where([T]),.b:where([T])):where([T])",
		],

		// only :is/:where/:not/:has take a selector argument. :host() is not in that
		// set -- components render into the light dom, so a :host() rule never
		// applies whether or not its argument is scoped
		[":host(.a)", ":host(.a):where([T])"],
		[":nth-child(2n of .foo)", ":nth-child(2n of .foo):where([T])"],
	];

	for (let [input, want] of cases)
		check(input).assertEq(rewriteSelector(input, TAG), want);
});

test("css/scope: :global and :scope", () => {
	let cases: [string, string][] = [
		// :global() contributes its argument unscoped, and opts the compound it
		// sits in out of scoping entirely
		[":global(.x)", ".x"],
		[".a:global(.x)", ".a.x"],
		[":global(.x) .b", ".x .b:where([T])"],
		[".a :global(.x .y) .b", ".a:where([T]) .x .y .b:where([T])"],
		// ...but only that compound: the selector around it still scopes
		[".a:has(:global(.x))", ".a:has(.x):where([T])"],
		[
			":is(.a, :global(.b)) .c",
			":is(.a:where([T]),.b):where([T]) .c:where([T])",
		],

		[":scope .a", `[T][${CSS_COMPONENT}]:where([T]) .a:where([T])`],
	];

	for (let [input, want] of cases)
		check(input).assertEq(rewriteSelector(input, TAG), want);
});

// _rewrite hands the sheet to the browser's css parser before it ever sees a
// selector, so :global() has to go in as something parseable and come back out.
// that a real browser drops a rule containing :global() is the premise of the
// whole dance, and neither parser here models it -- lightningcss implements
// :global() for css modules and happy-dom passes unknown pseudo-classes through
// verbatim -- so this covers the round-trip only, not the premise.
test("css/scope: :global survives the cssom round-trip", () => {
	let placeholder = ":where(._uid ";
	let doc = new Window().document;
	let style = doc.createElement("style");
	style.innerText = ".a:global(.x) .b{color:red}".replaceAll(
		":global(",
		placeholder
	);
	doc.head.appendChild(style);

	let rules = [...((style as any).sheet.cssRules as any[])];
	check("rule survived parsing").assertEq(rules.length, 1);

	let back = rules[0].selectorText.replaceAll(placeholder, ":global(");
	check("selector round-trips").assertEq(back, ".a:global(.x) .b");
	check("and rewrites from the round-tripped form").assertEq(
		rewriteSelector(back, TAG),
		".a.x .b:where([T])"
	);
});
