import { DREAMLAND, WEAKMAP } from "../consts";
import { Component, ComponentFn, ComponentFnState } from "../jsx/definitions";
import { CREATE_ELEMENT, DomImpl } from "../jsx/dom";
import { Stateful } from "../state/state";
import { CSS_COMPONENT, rewriteSelector } from "./scope";

export { CSS_COMPONENT };

export let genuid = () => {
	// prettier-ignore
	// dl 0.0.x:
	//     `${Array(4).fill(0).map(()=>Math.floor(Math.random()*36).toString(36)}).join('')}`
	return [...Array(16)].reduce(a => a + Math.random().toString(36)[2], '')
	// the above will occasionally misfire with `undefined` or 0 in the string whenever Math.random returns exactly 0 or really small numbers
	// we don't care, it would be very uncommon for that to actually happen 16 times
};
export let CSS_IDENT = "dlcss-";
let THROWAWAY_ID = CSS_IDENT + genuid();

let GLOBAL_WHERE_TRANSFORMATION = `:where(._${genuid()} `;
let GLOBAL = ":global(";

// index into _funcs -> accessor. the css text numbers its var() the same way, so
// the two stay aligned with no per-document rewriting: whoever sets the inline
// property builds `--${id}-${i}` itself
export type CssVarMap = [number, (props: Stateful<any>) => any][];

export interface CssInit {
	/// THIS IS A SEALED MARKER TYPE. do not try accessing it
	readonly [DREAMLAND]: unique symbol;

	// @internal
	_vars?: CssVarMap;
	// @internal
	// built and rewritten, still carrying THROWAWAY_ID
	_css?: string;

	// @internal
	// per-document ident, doubles as whether or not a style tag is already installed
	_map: WeakMap<DomImpl[0]["head"], string>;

	// @internal
	_get(
		DOCUMENT: DomImpl[0],
		hydrating: DomImpl[5],
		genCssUid: DomImpl[4],
		init: Component<any, any>
	): string;
}

// :global() is not valid css, so the browser would drop every rule using it
// before we ever get to look at the sheet. swap it for something parseable on
// the way in and swap it back per-selector on the way out
let rewriteRules = (list: any) =>
	[...list].forEach((rule: any) => {
		if (rule.selectorText) {
			let newselector = rewriteSelector(
				rule.selectorText.replaceAll(GLOBAL_WHERE_TRANSFORMATION, GLOBAL),
				THROWAWAY_ID
			);
			rule.selectorText = newselector;
			dev: {
				if (
					rule.selectorText.replaceAll(/\s+/g, "") !==
					newselector.replaceAll(/\s+/g, "")
				)
					console.warn(
						"[dreamland/css]: invalid selector",
						rule.selectorText,
						newselector
					);
			}
		}
		if (rule.cssRules) {
			rewriteRules(rule.cssRules);
		}
	});

export let css = /*@__NO_SIDE_EFFECTS__*/ <T extends ComponentFn<any, any>>(
	_strings: TemplateStringsArray,
	..._funcs: (((state: ComponentFnState<T>) => any) | string)[]
): CssInit => {
	return {
		_map: WEAKMAP(),
		_get(DOCUMENT, hydrating, genCssUid, init) {
			let style: HTMLStyleElement = DOCUMENT[CREATE_ELEMENT]("style");
			let _id = this._map.get(DOCUMENT.head);
			if (_id) return _id;

			_id = CSS_IDENT + genCssUid(init, style).toLowerCase();
			this._vars ??= _funcs.flatMap((f, i) =>
				typeof f == "function" ? [[i, f] as CssVarMap[number]] : []
			);

			if (!hydrating?.(style)) {
				let _css = this._css;

				dev: {
					style.setAttribute(CSS_COMPONENT, init.name);
				}
				style.setAttribute(CSS_IDENT + "id", _id);
				DOCUMENT.head.append(style); // .sheet only exists on appended style els

				if (!_css) {
					style.innerText = _strings
						.reduce(
							(acc, string, i) =>
								acc +
								string +
								(typeof _funcs[i] == "function"
									? `var(--${THROWAWAY_ID}-${i})`
									: _funcs[i] || ""),
							""
						)
						.replaceAll(GLOBAL, GLOBAL_WHERE_TRANSFORMATION);
					rewriteRules(style.sheet!.cssRules);
					this._css = _css = Array.from(
						style.sheet!.cssRules,
						(x) => x.cssText
					).join("\n");
				}

				style.innerText = _css.replaceAll(THROWAWAY_ID, _id);
			}

			this._map.set(DOCUMENT.head, _id);
			return _id;
		},
	} satisfies Omit<CssInit, typeof DREAMLAND> as CssInit;
};
