// https://github.com/LeaVerou/parsel modified for size
/*
MIT License

Copyright (c) 2020 Lea Verou

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import {
	COMMA_TOKEN,
	COMBINATOR_TOKEN,
	ID_TOKEN,
	CLASS_TOKEN,
	PSEUDO_ELEMENT_TOKEN,
	PSEUDO_CLASS_TOKEN,
	UNIVERSAL_TOKEN,
	ATTRIBUTE_TOKEN,
	TYPE_TOKEN,
} from "../consts";
import { fatal } from "../utils";

export interface BaseToken {
	readonly _type: symbol;
	_content: string;
	_pos: [number, number];
}

export interface CommaToken extends BaseToken {
	_type: typeof COMMA_TOKEN;
}

export interface CombinatorToken extends BaseToken {
	_type: typeof COMBINATOR_TOKEN;
}

export interface NamedToken extends BaseToken {
	name: string;
}

export interface IdToken extends NamedToken {
	_type: typeof ID_TOKEN;
}

export interface ClassToken extends NamedToken {
	_type: typeof CLASS_TOKEN;
}

export interface PseudoElementToken extends NamedToken {
	_type: typeof PSEUDO_ELEMENT_TOKEN;
	arg?: string;
}

export interface PseudoClassToken extends NamedToken {
	_type: typeof PSEUDO_CLASS_TOKEN;
	arg?: string;
}

export interface NamespacedToken extends BaseToken {
	namespace?: string;
}

export interface UniversalToken extends NamespacedToken {
	_type: typeof UNIVERSAL_TOKEN;
}

export interface AttributeToken extends NamespacedToken, NamedToken {
	_type: typeof ATTRIBUTE_TOKEN;
	op?: string;
	val?: string;
	case?: "i" | "I" | "s" | "S";
}

export interface TypeToken extends NamespacedToken, NamedToken {
	_type: typeof TYPE_TOKEN;
}

export interface UnknownToken extends BaseToken {
	_type: never;
}

export type Token =
	| AttributeToken
	| IdToken
	| ClassToken
	| CommaToken
	| CombinatorToken
	| PseudoElementToken
	| PseudoClassToken
	| UniversalToken
	| TypeToken
	| UnknownToken;

let TOKENS: Map<symbol, RegExp> = new Map([
	[
		ATTRIBUTE_TOKEN,
		/\[\s*(?:(?<namespace>\*|[-\w\P{ASCII}]*)\|)?(?<name>[-\w\P{ASCII}]+)\s*(?:(?<op>\W?=)\s*(?<val>.+?)\s*(\s(?<case>[iIsS]))?\s*)?\]/gu,
	],
	[ID_TOKEN, /#(?<name>[-\w\P{ASCII}]+)/gu],
	[CLASS_TOKEN, /\.(?<name>[-\w\P{ASCII}]+)/gu],
	[COMMA_TOKEN, /\s*,\s*/g], // must be before combinator
	[COMBINATOR_TOKEN, /\s*[\s>+~]\s*/g], // this must be after attribute
	[PSEUDO_ELEMENT_TOKEN, /::(?<name>[-\w\P{ASCII}]+)(?:\((?<arg>¶*)\))?/gu], // this must be before pseudo-class
	[PSEUDO_CLASS_TOKEN, /:(?<name>[-\w\P{ASCII}]+)(?:\((?<arg>¶*)\))?/gu],
	[UNIVERSAL_TOKEN, /(?:(?<namespace>\*|[-\w\P{ASCII}]*)\|)?\*/gu],
	[
		TYPE_TOKEN,
		/(?:(?<namespace>\*|[-\w\P{ASCII}]*)\|)?(?<name>[-\w\P{ASCII}]+)/gu,
	], // this must be last
]);
let TRIM_TOKENS = new Set<symbol>([COMBINATOR_TOKEN, COMMA_TOKEN]);

let getArgumentPatternByType = (type: symbol) => {
	if ([PSEUDO_CLASS_TOKEN, PSEUDO_ELEMENT_TOKEN].includes(type)) {
		return new RegExp(
			TOKENS.get(type)!.source.replace("(?<arg>¶*)", "(?<arg>.*)"),
			"gu"
		);
	} else {
		return TOKENS.get(type);
	}
};

let gobbleParens = (text: string, offset: number): string => {
	let nesting = 0;
	let result = "";
	for (; offset < text.length; offset++) {
		let char = text[offset];

		if (char === "(") {
			++nesting;
		} else if (char === ")") {
			--nesting;
		}

		result += char;
		if (nesting === 0) {
			return result;
		}
	}
	return result;
};

let tokenizeBy = (text: string): Token[] => {
	if (!text) {
		return [];
	}

	let tokens: (Token | string)[] = [text];
	for (let [_type, pattern] of TOKENS.entries()) {
		for (let i = 0; i < tokens.length; i++) {
			let token = tokens[i];
			if (typeof token !== "string") {
				continue;
			}

			pattern.lastIndex = 0;
			let match = pattern.exec(token);
			if (!match) {
				continue;
			}

			let from = match.index - 1;
			let args: typeof tokens = [];
			let _content = match[0];

			let before = token.slice(0, from + 1);
			if (before) {
				args.push(before);
			}

			args.push({
				...match.groups,
				_type,
				_content,
			} as any);

			let after = token.slice(from + _content.length + 1);
			if (after) {
				args.push(after);
			}

			tokens.splice(i, 1, ...args);
		}
	}

	let offset = 0;
	for (let token of tokens) {
		if (typeof token === "string") {
			dev: {
				throw new Error(
					`Unexpected sequence ${token} found at index ${offset}`
				);
			}
			prod: {
				fatal();
			}
		} else {
			offset += token._content.length;
			token._pos = [offset - token._content.length, offset];
			if (TRIM_TOKENS.has(token._type)) {
				token._content = token._content.trim() || " ";
			}
		}
	}

	return tokens as Token[];
};

let STRING_PATTERN = /(['"])([^\\\n]*?)\1/g;
let ESCAPE_PATTERN = /\\./g;
export let tokenize = (selector: string): Token[] => {
	// Prevent leading/trailing whitespaces from being interpreted as combinators
	selector = selector.trim();
	if (selector === "") {
		return [];
	}

	type Replacement = { _value: string; _offset: number };
	let replacements: Replacement[] = [];

	// Replace escapes with placeholders.
	selector = selector.replace(
		ESCAPE_PATTERN,
		(_value: string, _offset: number) => {
			replacements.push({ _value, _offset });
			return "\uE000".repeat(_value.length);
		}
	);

	// Replace strings with placeholders.
	selector = selector.replace(
		STRING_PATTERN,
		(_value: string, quote: string, content: string, _offset: number) => {
			replacements.push({ _value, _offset });
			return `${quote}${"\uE001".repeat(content.length)}${quote}`;
		}
	);

	// Replace parentheses with placeholders.
	{
		let pos = 0;
		let offset: number;
		while ((offset = selector.indexOf("(", pos)) > -1) {
			let value = gobbleParens(selector, offset);
			replacements.push({ _value: value, _offset: offset });
			selector = `${selector.substring(0, offset)}(${"¶".repeat(
				value.length - 2
			)})${selector.substring(offset + value.length)}`;
			pos = offset + value.length;
		}
	}

	// Now we have no nested structures and we can parse with regexes
	let tokens = tokenizeBy(selector);

	// Replace placeholders in reverse order.
	let changedTokens = new Set<Token>();
	for (let replacement of replacements.reverse()) {
		for (let token of tokens) {
			let { _offset, _value } = replacement;
			if (
				!(token._pos[0] <= _offset && _offset + _value.length <= token._pos[1])
			) {
				continue;
			}

			let { _content } = token;
			let tokenOffset = _offset - token._pos[0];
			token._content =
				_content.slice(0, tokenOffset) +
				_value +
				_content.slice(tokenOffset + _value.length);
			if (token._content !== _content) {
				changedTokens.add(token);
			}
		}
	}

	// Update changed tokens.
	for (let token of changedTokens) {
		let pattern = getArgumentPatternByType(token._type);
		if (!pattern) {
			dev: {
				throw new Error(`Unknown token type: ${String(token._type)}`);
			}
			prod: {
				fatal();
			}
		}
		pattern.lastIndex = 0;
		let match = pattern.exec(token._content);
		if (!match) {
			dev: {
				throw new Error(
					`Unable to parse content for ${String(token._type)}: ${token._content}`
				);
			}
			prod: {
				fatal();
			}
		}
		Object.assign(token, match.groups);
	}

	return tokens;
};

export let stringify = (tokens: Token[]): string => {
	return tokens.map((x) => x._content).join("");
};
