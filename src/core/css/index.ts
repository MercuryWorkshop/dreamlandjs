import { ComponentFn, ComponentFnState } from "../jsx/definitions";
import { CssInfo } from "../jsx/dom";
import { CSS_COMPONENT, rewriteSelector } from "./scope";

export { CSS_COMPONENT };

export type CssInit = {
	// kept public since we need a unique type but a lie
	_strings: TemplateStringsArray;
	_funcs: (((state: any) => any) | string)[];
	// @internal
	_rewrite: typeof _rewrite;
	// @internal
	_build: typeof _build;
};

export let css = /*@__NO_SIDE_EFFECTS__*/ <T extends ComponentFn<any, any>>(
	_strings: TemplateStringsArray,
	..._funcs: (((state: ComponentFnState<T>) => any) | string)[]
): CssInit => {
	return {
		_strings,
		_funcs,
		_rewrite,
		_build,
	};
};

export let genuid = () => {
	// prettier-ignore
	// dl 0.0.x:
	//     `${Array(4).fill(0).map(()=>Math.floor(Math.random()*36).toString(36)}).join('')}`
	return [...Array(16)].reduce(a => a + Math.random().toString(36)[2], '')
	// the above will occasionally misfire with `undefined` or 0 in the string whenever Math.random returns exactly 0 or really small numbers
	// we don't care, it would be very uncommon for that to actually happen 16 times
};

let _build = (init: CssInit, info: CssInfo): string => {
	let cssString = "";

	for (let i = 0; i < init._strings.length; i++) {
		cssString += init._strings[i];
		if (i + 1 < init._strings.length) {
			let func = init._funcs[i];
			if (typeof func === "string") {
				cssString += func;
			} else {
				let varid = `--${info._id}-${i}`;
				cssString += `var(${varid})`;
				info._vars.push([varid, func]);
			}
		}
	}

	return cssString;
};

let GLOBAL = ":global(";
let _rewrite = (style: HTMLStyleElement, css: string, tag: string) => {
	// :global() is not valid css, so the browser would drop every rule using it
	// before we ever get to look at the sheet. swap it for something parseable on
	// the way in and swap it back per-selector on the way out
	let globalWhereTransformation = `:where(._${genuid()} `;

	let rewriteRules = (list: any) =>
		[...list].forEach((rule: any) => {
			if (rule.selectorText) {
				let newselector = rewriteSelector(
					rule.selectorText.replaceAll(globalWhereTransformation, GLOBAL),
					tag
				);
				rule.selectorText = newselector;
				dev: {
					if (
						rule.selectorText.replace(/\s+/g, "") !==
						newselector.replace(/\s+/g, "")
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
			return rule;
		});

	style.innerText = css.replaceAll(GLOBAL, globalWhereTransformation);
	rewriteRules(style.sheet!.cssRules);
	dev: {
		style.innerText = [...style.sheet!.cssRules]
			.map((x) => x.cssText)
			.join("\n");
	}
};
