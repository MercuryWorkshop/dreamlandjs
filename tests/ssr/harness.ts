import { Window } from "happy-dom";
import renderToString from "dom-serializer";
import { test } from "../harness.ts";
import { setDomImpl, domImpl, jsx } from "../../dist/core.js";
import type { DomImpl } from "../../dist/core.js";
import { render } from "../../dist/ssr.server.js";
import { hydrate } from "../../dist/ssr.client.js";

// these are the options dreamland/vite's renderSsr uses. the client decodes the
// payload by round-tripping it through a textarea, so serializing it any other
// way would test a pipeline nobody runs
let CFG = { encodeEntities: "utf8", decodeEntities: false } as const;

export interface SsrPayload {
	k /* interned keys */: string[];
	v /* interned primitives */: any[];
	r /* interned refs */: any[];
	d /* component state */: Record<number, any>;
	n /* text/comments: [parent, childIndex] */: Record<number, any>;
	t /* text splits */: [number, number, number][];
	p /* pruned id ranges, dev build only */?: (number | [number, number])[];
	c /* css idents seen, dev build only */?: string[];
}

export interface Rendered {
	/** serialized markup for the component root */
	body: string;
	/** serialized markup for the payload script plus any component stylesheets */
	head: string;
	/** the payload, read before serialization so escaping is a separate concern */
	payload: SsrPayload;
}

// render()/hydrate() call whatever they are handed with no receiver, so a bare
// component would see `this === undefined`. Instantiating it through jsx() is
// what a real entrypoint does (`render(() => App(path))`) and is what gives the
// component its state, its cx, and an entry in the payload.
let instantiate = (component: any) => () => jsx(component, {});

export let serverRender = async (component: any): Promise<Rendered> => {
	let out = await render(instantiate(component));
	return {
		body: renderToString(out.component, CFG),
		head: renderToString([out.data, ...out.head], CFG),
		payload: JSON.parse((out.data.children[0] as any).data),
	};
};

// mirrors the default dom impl, but bound to a window we can throw away per test
// instead of whatever globalThis happened to hold when dist/core.js was imported
export let clientDom = (win: any): DomImpl => [
	win.document,
	win.Node,
	(text?: string) => new win.Text(text),
	(text?: string) => new win.Comment(text),
	(init: any) => init.name + "-" + win.crypto.randomUUID(),
	() => false,
];

export let mountDocument = (r: Rendered) => {
	let win = new Window();
	win.document.write(
		`<!doctype html><html><head>${r.head}</head><body>${r.body}</body></html>`
	);
	return win;
};

// Installing the client dom has to outlive hydrate(): assertions that poke state
// afterwards run listeners that call getDom(), and the impl underneath is the one
// dist/core.js captured at import time -- under node its Node slot is undefined,
// so `child instanceof NODE` throws inside an event dispatch and gets swallowed.
// ssrTest() pops this stack once the test body is done.
let restores: (() => void)[] = [];

export let installClientDom = (win: any) => {
	let old = domImpl;
	let impl = clientDom(win);
	setDomImpl(() => impl);
	restores.push(() => setDomImpl(old));
};

export let hydrateIn = async (win: any, component: any) => {
	installClientDom(win);
	return await hydrate(
		instantiate(component),
		win.document.body.firstElementChild,
		win.document.head,
		win.document.querySelector("[dlssr-d]")
	);
};

/**
 * test(), but the dom impl any roundTrip()/hydrateIn() installed is torn down
 * afterwards. Required: leaving it installed would make the *next* test's
 * serverRender() bypass the AsyncLocalStorage wrapper that routes rendering to
 * the ssr vdom.
 */
export let ssrTest: typeof test = (name, fn, variant) =>
	test(
		name,
		async () => {
			let depth = restores.length;
			try {
				return await fn();
			} finally {
				while (restores.length > depth) restores.pop()!();
			}
		},
		variant
	);

export interface RoundTrip extends Rendered {
	win: any;
	/** whatever hydrate() resolved to */
	root: any;
	/** document.body.innerHTML once hydration (including mounts) has settled */
	client: string;
}

/**
 * Renders `server` through the ssr vdom, parses the result into a fresh
 * document, and hydrates `client` (defaulting to the same component) against it.
 * Pass a different `client` to model code that takes a different branch in the
 * browser than it did on the server.
 */
export let roundTrip = async (
	server: any,
	client: any = server
): Promise<RoundTrip> => {
	let r = await serverRender(server);
	let win = mountDocument(r);
	let root = await hydrateIn(win, client);
	return { ...r, win, root, client: win.document.body.innerHTML };
};

// hydration deliberately leaves dlssri on the dom, so it is noise when comparing
// what the server sent against what the client ended up with
export let norm = (html: string) => html.replace(/ dlssri="\d+"/g, "");

// a flat, readable description of a node's children. `<b>` for elements,
// quoted for text, `!` for comments -- enough to catch a stray anchor or a
// duplicated subtree without depending on attribute order. comment *contents*
// are deliberately not included; use comments() when they are the point
export let shape = (el: any): string =>
	[...el.childNodes]
		.map((n: any) =>
			n.nodeType === 3
				? JSON.stringify(n.data)
				: n.nodeType === 8
					? "!"
					: "<" + n.nodeName.toLowerCase() + ">"
		)
		.join(",");

export let comments = (el: any): string[] =>
	[...el.childNodes]
		.filter((n: any) => n.nodeType === 8)
		.map((n: any) => n.data);

/** every id in the payload that has no entry: pruned nodes and plain elements */
export let holes = (p: SsrPayload) => {
	let ids = Object.keys(p.n).map(Number);
	let max = Math.max(...ids, 0);
	let present = new Set(ids);
	let out: number[] = [];
	for (let i = 0; i <= max; i++) if (!present.has(i)) out.push(i);
	return out;
};
