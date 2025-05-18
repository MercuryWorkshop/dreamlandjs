// inspired by https://github.com/LeaVerou/parsel

export interface BaseToken {
	type: string;
	content: string;
	pos: [number, number];
}

export interface CommaToken extends BaseToken {
	type: "comma";
}

export interface CombinatorToken extends BaseToken {
	type: "combinator";
}

export interface NamedToken extends BaseToken {
	name: string;
}

export interface IdToken extends NamedToken {
	type: "id";
}

export interface ClassToken extends NamedToken {
	type: "class";
}

export interface PseudoElementToken extends NamedToken {
	type: "pseudo-element";
	argument?: string;
}

export interface PseudoClassToken extends NamedToken {
	type: "pseudo-class";
	argument?: string;
}

export interface NamespacedToken extends BaseToken {
	namespace?: string;
}

export interface UniversalToken extends NamespacedToken {
	type: "universal";
}

export interface AttributeToken extends NamespacedToken, NamedToken {
	type: "attribute";
	operator?: string;
	value?: string;
	caseSensitive?: "i" | "I" | "s" | "S";
}

export interface TypeToken extends NamespacedToken, NamedToken {
	type: "type";
}

export interface UnknownToken extends BaseToken {
	type: never;
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

let TOKENS: Record<string, RegExp> = {
	attribute:
		/\[\s*(?:(?<namespace>\*|[-\w\P{ASCII}]*)\|)?(?<name>[-\w\P{ASCII}]+)\s*(?:(?<operator>\W?=)\s*(?<value>.+?)\s*(\s(?<caseSensitive>[iIsS]))?\s*)?\]/gu,
	id: /#(?<name>[-\w\P{ASCII}]+)/gu,
	class: /\.(?<name>[-\w\P{ASCII}]+)/gu,
	comma: /\s*,\s*/g, // must be before combinator
	combinator: /\s*[\s>+~]\s*/g, // this must be after attribute
	"pseudo-element": /::(?<name>[-\w\P{ASCII}]+)(?:\((?<argument>¶*)\))?/gu, // this must be before pseudo-class
	"pseudo-class": /:(?<name>[-\w\P{ASCII}]+)(?:\((?<argument>¶*)\))?/gu,
	universal: /(?:(?<namespace>\*|[-\w\P{ASCII}]*)\|)?\*/gu,
	type: /(?:(?<namespace>\*|[-\w\P{ASCII}]*)\|)?(?<name>[-\w\P{ASCII}]+)/gu, // this must be last
};
const TRIM_TOKENS = new Set<string>(["combinator", "comma"]);

function getArgumentPatternByType(type: string) {
	switch (type) {
		case "pseudo-element":
		case "pseudo-class":
			return new RegExp(
				TOKENS[type]!.source.replace("(?<argument>¶*)", "(?<argument>.*)"),
				"gu"
			);
		default:
			return TOKENS[type];
	}
}

function gobbleParens(text: string, offset: number): string {
	let nesting = 0;
	let result = "";
	for (; offset < text.length; offset++) {
		const char = text[offset];
		switch (char) {
			case "(":
				++nesting;
				break;
			case ")":
				--nesting;
				break;
		}
		result += char;
		if (nesting === 0) {
			return result;
		}
	}
	return result;
}

function tokenizeBy(text: string): Token[] {
	if (!text) {
		return [];
	}

	const tokens: (Token | string)[] = [text];
	for (const [type, pattern] of Object.entries(TOKENS)) {
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			if (typeof token !== "string") {
				continue;
			}

			pattern.lastIndex = 0;
			const match = pattern.exec(token);
			if (!match) {
				continue;
			}

			const from = match.index - 1;
			const args: typeof tokens = [];
			const content = match[0];

			const before = token.slice(0, from + 1);
			if (before) {
				args.push(before);
			}

			args.push({
				...match.groups,
				type,
				content,
			} as unknown as Token);

			const after = token.slice(from + content.length + 1);
			if (after) {
				args.push(after);
			}

			tokens.splice(i, 1, ...args);
		}
	}

	let offset = 0;
	for (const token of tokens) {
		switch (typeof token) {
			case "string":
				throw new Error(
					`Unexpected sequence ${token} found at index ${offset}`
				);
			case "object":
				offset += token.content.length;
				token.pos = [offset - token.content.length, offset];
				if (TRIM_TOKENS.has(token.type)) {
					token.content = token.content.trim() || " ";
				}
				break;
		}
	}

	return tokens as Token[];
}

const STRING_PATTERN = /(['"])([^\\\n]+?)\1/g;
const ESCAPE_PATTERN = /\\./g;
export function tokenize(selector: string): Token[] {
	// Prevent leading/trailing whitespaces from being interpreted as combinators
	selector = selector.trim();
	if (selector === "") {
		return [];
	}

	type Replacement = { value: string; offset: number };
	const replacements: Replacement[] = [];

	// Replace escapes with placeholders.
	selector = selector.replace(
		ESCAPE_PATTERN,
		(value: string, offset: number) => {
			replacements.push({ value, offset });
			return "\uE000".repeat(value.length);
		}
	);

	// Replace strings with placeholders.
	selector = selector.replace(
		STRING_PATTERN,
		(value: string, quote: string, content: string, offset: number) => {
			replacements.push({ value, offset });
			return `${quote}${"\uE001".repeat(content.length)}${quote}`;
		}
	);

	// Replace parentheses with placeholders.
	{
		let pos = 0;
		let offset: number;
		while ((offset = selector.indexOf("(", pos)) > -1) {
			const value = gobbleParens(selector, offset);
			replacements.push({ value, offset });
			selector = `${selector.substring(0, offset)}(${"¶".repeat(
				value.length - 2
			)})${selector.substring(offset + value.length)}`;
			pos = offset + value.length;
		}
	}

	// Now we have no nested structures and we can parse with regexes
	const tokens = tokenizeBy(selector);

	// Replace placeholders in reverse order.
	const changedTokens = new Set<Token>();
	for (const replacement of replacements.reverse()) {
		for (const token of tokens) {
			const { offset, value } = replacement;
			if (!(token.pos[0] <= offset && offset + value.length <= token.pos[1])) {
				continue;
			}

			const { content } = token;
			const tokenOffset = offset - token.pos[0];
			token.content =
				content.slice(0, tokenOffset) +
				value +
				content.slice(tokenOffset + value.length);
			if (token.content !== content) {
				changedTokens.add(token);
			}
		}
	}

	// Update changed tokens.
	for (const token of changedTokens) {
		const pattern = getArgumentPatternByType(token.type);
		if (!pattern) {
			throw new Error(`Unknown token type: ${token.type}`);
		}
		pattern.lastIndex = 0;
		const match = pattern.exec(token.content);
		if (!match) {
			throw new Error(
				`Unable to parse content for ${token.type}: ${token.content}`
			);
		}
		Object.assign(token, match.groups);
	}

	return tokens;
}

export function stringify(tokens: Token[]): string {
	return tokens.map((x) => x.content).join("");
}
