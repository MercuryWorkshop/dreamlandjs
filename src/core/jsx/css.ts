import { CSS, DREAMLAND } from "../consts";

export type DLCSS = {
	[DREAMLAND]: typeof CSS;
	// @internal
	_cascade: boolean;
	css: string;
};

function rewriteCascading(css: string, tag: string): string {
	let sheet = new CSSStyleSheet();
	sheet.replaceSync(css);

	function rewriteRules(list: CSSRuleList, tag: string): CSSRule[] {
		let rules = Array.from(list);

		for (let rule of rules) {
			if (rule instanceof CSSStyleRule) {
				rule.selectorText = rule.selectorText
					.split(",")
					.map((x) =>
						x
							.trim()
							.split(" ")
							.map((x) => x + ":where(." + tag + ")")
							.join(" ")
					)
					.join(",");
			}
			if (rule instanceof CSSGroupingRule) {
				rewriteRules(rule.cssRules, tag);
			}
		}

		return rules;
	}

	return rewriteRules(sheet.cssRules, tag)
		.map((x) => x.cssText)
		.join("");
}

export function rewriteCSS(css: DLCSS, tag: string): string {
	if (css._cascade) {
		return rewriteCascading(css.css, tag);
	} else {
		throw "todo";
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
	return {
		[DREAMLAND]: CSS,
		_cascade: false,
		css: flatten(template, params),
	};
}
