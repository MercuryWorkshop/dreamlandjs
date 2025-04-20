import { CSS, DREAMLAND } from "../consts";

export type DLCSS = {
	[DREAMLAND]: typeof CSS;
	// @internal
	_cascade: boolean;
	css: string;
};

export let cssBoundary = "dlcomponent";

function rewriteCascading(css: CSSRuleList, root: string, tag: string): string {
	function rewriteRules(list: CSSRuleList): CSSRule[] {
		let rules = Array.from(list);

		for (let rule of rules) {
			if (rule instanceof CSSStyleRule) {
				// :scope targets the root in @scope {} so just use that
				rule.selectorText.replace(":scope", root);
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
				rewriteRules(rule.cssRules);
			}
		}

		return rules;
	}

	return rewriteRules(css)
		.map((x) => x.cssText)
		.join("");
}

function rewriteScoped(css: CSSRuleList, root: string): string {
	let cssText = Array.from(css)
		.map((x) => x.cssText)
		.join("");
	return `@scope (.${root}) to (:not(.${root}).${cssBoundary}) { ${cssText} }`;
}

export function rewriteCSS(css: DLCSS, root: string, tag: string): string {
	let sheet = new CSSStyleSheet();
	sheet.replaceSync(css.css);
	let rules = sheet.cssRules;

	if (css._cascade) {
		return rewriteCascading(rules, root, tag);
	} else {
		return rewriteScoped(rules, root);
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
	if (!window.CSSScopeRule) {
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
