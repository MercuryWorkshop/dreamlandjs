// added to every component's root, determines start of scoped css scope
export let CSS_COMPONENT = "dlc";

// pseudo-classes that take a selector list as their argument. everything else --
// :nth-child(2n+1), :nth-of-type(even), :dir(rtl), :lang(en) -- keeps its argument
// verbatim, because rewriting inside those produces a selector the browser rejects,
// and an unparseable selector makes it drop the whole rule.
//
// :host()/:host-context() are left out on purpose: components render into the light
// dom, so a :host() rule never applies whether or not its argument is scoped. so is
// the `of S` of :nth-child(An+B of S), which leaves S unscoped -- that only shifts
// which siblings get counted, never which elements can match
let SELECTOR_ARG = ["is", "where", "not", "has"];
let IDENT = /[-\w\P{ASCII}]/u;
// a run of these ends one compound selector and starts the next
let SEPARATOR = /[\s>+~,]/;

// index just past the `close` matching the bracket at `offset`, stepping over
// nested pairs, strings and escapes. selectors reaching here come from CSSOM, so
// they are already known to balance -- a truncated one consumes the remainder.
//
// split("") rather than [...text]: findIndex hands back an index into the array it
// walked, and only splitting by code unit keeps that usable as a string offset. a
// class name may hold astral characters (`.\u{1F600}` is a valid selector), and
// iterating those by code point would slide every later index out from under us
let matching = (
	text: string,
	offset: number,
	close: string,
	nesting = 0,
	open = text[offset],
	quote = "",
	escape = false
): number =>
	text
		.split("")
		.findIndex(
			(x, i) =>
				i >= offset &&
				(escape ? (escape = false) : x == "\\" ? !(escape = true) : true) &&
				(quote = quote == x ? "" : quote || (/['"]/.test(x) ? x : "")) == "" &&
				(nesting += x == open ? 1 : x == close ? -1 : 0) == 0
		) + 1 || text.length;

// rewrites `sel` so that every compound selector in it also has to match `.tag`.
//
// `:where()` contributes no specificity, so with `.tag` on every element of the
// component this is an identity transform: same elements matched, same cascade.
// scoping every compound rather than only the subject is what keeps a selector
// from reaching through a child component's subtree.
export let rewriteSelector = (
	sel: string,
	tag: string,
	inGlobal?: number
): string => {
	let out = "";
	// index in `out` where the current compound's trailing run of pseudo-elements
	// begins, or -1. nothing may follow a pseudo-element, so the scope class has
	// to be spliced in ahead of one
	let pseudoElAt = -1;
	// index in `out` where the current compound begins
	let start = 0;
	// whether the current compound opted out of scoping via :global()
	let global = 0;
	let i = 0;

	let scope = () => {
		// an empty compound is a leading/trailing separator, not something to scope
		if (inGlobal || global || out.length == start) return;
		let at = pseudoElAt < 0 ? out.length : pseudoElAt;
		out = out.slice(0, at) + `:where(.${tag})` + out.slice(at);
	};

	while (i < sel.length) {
		let c = sel[i];

		if (c == "\\") {
			out += sel.slice(i, (i += 2));
			pseudoElAt = -1;
		} else if (c == "[") {
			// an attribute value may contain anything, including separators and
			// unbalanced quotes of the other kind: ["a > b, c"]
			let end = matching(sel, i, "]");
			out += sel.slice(i, end);
			i = end;
			pseudoElAt = -1;
		} else if (c == ":") {
			let el = sel[i + 1] == ":" ? 1 : 0;
			let nameAt = i + 1 + el;
			let end = nameAt;
			while (end < sel.length && IDENT.test(sel[end])) end++;
			let name = sel.slice(nameAt, end).toLowerCase();
			let at = out.length;

			if (sel[end] == "(") {
				let close = matching(sel, end, ")");
				let arg = sel.slice(end + 1, close - 1);

				if (!el && name == "global") {
					// `:global(x)` contributes `x` unscoped, and opts the compound
					// it appears in out of scoping entirely
					out += rewriteSelector(arg, tag, 1);
					global = 1;
					pseudoElAt = -1;
					i = close;
					continue;
				}

				out +=
					sel.slice(i, end + 1) +
					(!el && SELECTOR_ARG.includes(name)
						? rewriteSelector(arg, tag, inGlobal)
						: arg) +
					")";
				i = close;
			} else {
				out +=
					!el && name == "scope"
						? `.${tag}.${CSS_COMPONENT}`
						: sel.slice(i, end);
				i = end;
			}

			pseudoElAt = el ? (pseudoElAt < 0 ? at : pseudoElAt) : -1;
		} else if (SEPARATOR.test(c)) {
			let end = i;
			while (end < sel.length && SEPARATOR.test(sel[end])) end++;

			// close off the compound we were in, then emit the separator that ended it
			scope();
			// the run collapses to its combinator: `  >  ` is one child combinator,
			// and whitespace around a `,` is not a descendant combinator
			out += sel.slice(i, end).trim() || " ";
			pseudoElAt = -1;
			global = 0;
			start = out.length;

			i = end;
		} else {
			out += c;
			i++;
			pseudoElAt = -1;
		}
	}
	scope();

	return out;
};
