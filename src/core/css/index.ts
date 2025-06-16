import {
	COMBINATOR_TOKEN,
	COMMA_TOKEN,
	PSEUDO_CLASS_TOKEN,
	PSEUDO_ELEMENT_TOKEN,
} from "../consts";
import { stringify, Token, tokenize } from "./selectorParser";

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
export let rewriteCSS = (css: string, tag: string): string => {
	let where = tokenize(`:where(.${tag})`);
	let globalWhereTransformation = `:where(._${genuid()} `;

	let rewriteSelector = (tokens: Token[], inGlobal?: boolean): Token[] => {
		for (let i = 0; i < tokens.length; i++) {
			let token = tokens[i];

			let idx: number, cnt: number, arr: Token[];
			if (token._type === PSEUDO_CLASS_TOKEN && token.arg) {
				token.arg = stringify(
					rewriteSelector(tokenize(token.arg), token.name === "global")
				);
				token._content = `:${token.name}(${token.arg})`;
			}
			if (token._type === PSEUDO_CLASS_TOKEN && token.name === "global") {
				idx = i;
				cnt = 1;
				arr = tokenize(token.arg);
			} else if (
				!inGlobal &&
				(i === tokens.length - 1 ||
					[COMBINATOR_TOKEN, COMMA_TOKEN].includes(tokens[i + 1]._type))
			) {
				let j = i;
				while (j > 0 && tokens[j]._type === PSEUDO_ELEMENT_TOKEN) {
					j--;
				}

				idx = j + 1;
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

	let rewriteRules = (list: CSSRule[]): CSSRule[] => {
		for (let rule of list) {
			if ("selectorText" in rule) {
				let rewritten = stringify(
					rewriteSelector(
						tokenize(
							(rule.selectorText as string).replaceAll(
								globalWhereTransformation,
								GLOBAL
							)
						)
					)
				).replace(/:scope/g, `.${tag}.${CSS_COMPONENT}`);
				rule.selectorText = rewritten;
			}
			if ("cssRules" in rule) {
				rewriteRules(Array.from(rule.cssRules as CSSRuleList));
			}
		}

		return list;
	};

	let sheet = new CSSStyleSheet();
	sheet.replaceSync(css.replaceAll(GLOBAL, globalWhereTransformation));
	return rewriteRules(Array.from(sheet.cssRules))
		.map((x) => x.cssText)
		.join("");
};
