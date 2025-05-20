import {
	COMBINATOR_TOKEN,
	COMMA_TOKEN,
	CSS,
	DREAMLAND,
	PSEUDO_CLASS_TOKEN,
} from "../consts";
import { stringify, Token, tokenize } from "./selectorParser";

export type DLCSS = {
	[DREAMLAND]: typeof CSS;
	// @internal
	_cascade: boolean;
	css: string;
};

// added to every component's root, determines start of scoped css scope
export let cssComponent = "dlc";
// added to a component's root if it's scoped, determines end of scoped css scope
// this lets scoped styles leak into cascading styles, replacing dl 0.0.x leak
export let cssBoundary = "dlb";

export function genuid() {
	// prettier-ignore
	// dl 0.0.x:
	//     `${Array(4).fill(0).map(()=>Math.floor(Math.random()*36).toString(36)}).join('')}`
	return [...Array(16)].reduce(a => a + Math.random().toString(36)[2], '')
	// the above will occasionally misfire with `undefined` or 0 in the string whenever Math.random returns exactly 0 or really small numbers
	// we don't care, it would be very uncommon for that to actually happen 16 times
}

let GLOBAL = ":global(";
function rewriteCascading(css: string, tag: string): string {
	let where = tokenize(`:where(.${tag})`);
	let globalWhereTransformation = `:where(.${genuid()} `;

	function rewriteRules(list: CSSRule[]): CSSRule[] {
		for (let rule of list) {
			if ("selectorText" in rule) {
				let tokens = tokenize(
					(rule.selectorText as string).replace(
						globalWhereTransformation,
						GLOBAL
					)
				);

				for (let i = 0; i < tokens.length; i++) {
					let token = tokens[i];

					let idx: number, cnt: number, arr: Token[];
					if (token._type === PSEUDO_CLASS_TOKEN && token.name === "global") {
						idx = i;
						cnt = 1;
						arr = tokenize(token.arg);
					} else if (
						i === tokens.length - 1 ||
						[COMBINATOR_TOKEN, COMMA_TOKEN].includes(tokens[i + 1]._type)
					) {
						idx = i + 1;
						cnt = 0;
						arr = where;
					}

					if (arr) {
						tokens.splice(idx, cnt, ...arr);
						i += arr.length;
					}
				}

				rule.selectorText = stringify(tokens).replace(
					":scope",
					`.${tag}.${cssComponent}`
				);
			}
			if ("cssRules" in rule) {
				rewriteRules(Array.from(rule.cssRules as CSSRuleList));
			}
		}

		return list;
	}

	let sheet = new CSSStyleSheet();
	sheet.replaceSync(css.replace(GLOBAL, globalWhereTransformation));
	return rewriteRules(Array.from(sheet.cssRules))
		.map((x) => x.cssText)
		.join("");
}

function rewriteScoped(css: string, tag: string): string {
	return `@scope(.${tag}.${cssComponent}) to (:not(.${tag}).${cssBoundary}){${css}}`;
}

export function rewriteCSS(css: DLCSS, tag: string): string {
	if (css._cascade) {
		return rewriteCascading(css.css, tag);
	} else {
		return rewriteScoped(css.css, tag);
	}
}

function flatten(template: TemplateStringsArray, params: any[]): string {
	let flattened = [];
	for (let i in template) {
		flattened.push(template[i]);
		if (params[i]) {
			flattened.push(params[i]);
		}
	}
	return flattened.join("");
}

export function cascade(
	template: TemplateStringsArray,
	...params: any[]
): DLCSS {
	return {
		[DREAMLAND]: CSS,
		_cascade: true,
		css: flatten(template, params),
	};
}

export function scope(template: TemplateStringsArray, ...params: any[]): DLCSS {
	if (!self.CSSScopeRule) {
		// firefox moment
		dev: {
			console.warn(
				"[dreamland.js] CSS scoping is not supported in your browser, unable to prevent styles from cascading"
			);
		}
		return cascade(template, ...params);
	}
	return {
		[DREAMLAND]: CSS,
		_cascade: false,
		css: flatten(template, params),
	};
}
