import { CSS, DREAMLAND } from "../consts";

export type DLCSS = {
	[DREAMLAND]: typeof CSS;
	// @internal
	_cascade: boolean;
	css: string;
};

// added to every component's root, determines start of scoped css scope
export let cssComponent = "dlcomponent";
// added to a component's root if it's scoped, determines end of scoped css scope
// this lets scoped styles leak into cascading styles, replacing dl 0.0.x leak
export let cssBoundary = "dlboundary";

function rewriteCascading(css: CSSRuleList, tag: string): string {
	function rewriteRules(list: CSSRuleList): CSSRule[] {
		let rules = Array.from(list);

		for (let rule of rules) {
			if ("selectorText" in rule) {
				rule.selectorText = (rule.selectorText as string)
					.replace(":scope", `.${tag}.${cssComponent}`)
					.split(",")
					.map((x) => x.trim().replace(" ", ":where(." + tag + ") "))
					.join(",");
			}
			if ("cssRules" in rule) {
				rewriteRules(rule.cssRules as CSSRuleList);
			}
		}

		return rules;
	}

	return rewriteRules(css)
		.map((x) => x.cssText)
		.join("");
}

function rewriteScoped(css: CSSRuleList, tag: string): string {
	let cssText = Array.from(css)
		.map((x) => x.cssText)
		.join("");
	return `@scope (.${tag}.${cssComponent}) to (:not(.${tag}).${cssBoundary}) { ${cssText} }`;
}

export function rewriteCSS(css: DLCSS, tag: string): string {
	let sheet = new CSSStyleSheet();
	sheet.replaceSync(css.css);
	let rules = sheet.cssRules;

	if (css._cascade) {
		return rewriteCascading(rules, tag);
	} else {
		return rewriteScoped(rules, tag);
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
