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

export function rewriteScoped(css: string, tag: string): string {
	let sheet = new CSSStyleSheet();
	sheet.replaceSync(css);
	return rewriteRules(sheet.cssRules, tag)
		.map((x) => x.cssText)
		.join("");
}
