import {
	COMBINATOR_TOKEN,
	COMMA_TOKEN,
	PSEUDO_CLASS_TOKEN,
	PSEUDO_ELEMENT_TOKEN,
} from "../consts";
import { Component } from "../jsx/definitions";
import { stringify, Token, tokenize } from "./selectorParser";

export type CssInit = {
	_strings: TemplateStringsArray;
	_funcs: ((state: any) => any)[];
};

export function css<T extends Component<any, any, any>>(
	_strings: TemplateStringsArray,
	..._funcs: ((state: ThisParameterType<T>) => any)[]
): CssInit {
	return {
		_strings,
		_funcs,
	};
}

// added to every component's root, determines start of scoped css scope
export let CSS_COMPONENT = "dlc";

export let genuid = () => {
	// prettier-ignore
	// dl 0.0.x:
	//     `${Array(4).fill(0).map(()=>Math.floor(Math.random()*36).toString(36)}).join('')}`
	return [...Array(16)].reduce(a => a + Math.random().toString(36)[2], '')
	// the above will occasionally misfire with `undefined` or 0 in the string whenever Math.random returns exactly 0 or really small numbers
	// we don't care, it would be very uncommon for that to actually happen 16 times
};

let GLOBAL = ":global(";
export let rewriteCSS = (style: HTMLStyleElement, css: string, tag: string) => {
	let where = tokenize(`:where(.${tag})`);
	let globalWhereTransformation = `:where(._${genuid()} `;

	let rewriteSelector = (tokens: Token[], inGlobal?: boolean): Token[] => {
		for (let i = 0; i < tokens.length; i++) {
			let token = tokens[i];

			let idx: number, cnt: number, arr: Token[];
			if (token._type == PSEUDO_CLASS_TOKEN && token.arg) {
				let global = token.nm == "global";

				let rewritten = rewriteSelector(tokenize(token.arg), global);
				if (global) {
					idx = i;
					cnt = 1;
					arr = rewritten;
				} else {
					token.arg = stringify(rewritten);
					token._content = `:${token.nm}(${token.arg})`;
				}
			} else if (
				!inGlobal &&
				(i === tokens.length - 1 ||
					[COMBINATOR_TOKEN, COMMA_TOKEN].includes(tokens[i + 1]._type))
			) {
				idx = i;
				while (idx > 0 && tokens[idx]._type == PSEUDO_ELEMENT_TOKEN) {
					idx--;
				}

				idx++;
				cnt = 0;
				arr = where;
			}

			if (arr) {
				tokens.splice(idx, cnt, ...arr);
				i += arr.length;
			}
		}
		return tokens;
	};

	let rewriteRules = (list: any) =>
		list.map((rule: any) => {
			if (rule.selectorText) {
				rule.selectorText = stringify(
					rewriteSelector(
						tokenize(
							rule.selectorText.replaceAll(globalWhereTransformation, GLOBAL)
						)
					)
				).replace(/:scope/g, `.${tag}.${CSS_COMPONENT}`);
			}
			if (rule.cssRules) {
				rewriteRules(rule.cssRules);
			}
			return rule;
		});

	style.innerText = css.replaceAll(GLOBAL, globalWhereTransformation);
	rewriteRules(style.sheet.cssRules);
	dev: {
		style.innerText = [...style.sheet.cssRules]
			.map((x) => x.cssText)
			.join("\n");
	}
};
