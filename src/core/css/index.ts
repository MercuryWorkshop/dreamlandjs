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

export function genuid() {
	// prettier-ignore
	// dl 0.0.x:
	//     `${Array(4).fill(0).map(()=>Math.floor(Math.random()*36).toString(36)}).join('')}`
	return [...Array(16)].reduce(a => a + Math.random().toString(36)[2], '')
	// the above will occasionally misfire with `undefined` or 0 in the string whenever Math.random returns exactly 0 or really small numbers
	// we don't care, it would be very uncommon for that to actually happen 16 times
}

let GLOBAL = ":global(";
let COMPONENT = ":component";
function rewriteCascading(css: string, tag: string): string {
	let globalWhereTransformation = `:where(.global-${genuid()} `;
	let componentWhereTransformation = `:where(.component-${genuid()})`;
	function rewriteRules(list: CSSRule[]): CSSRule[] {
		for (let rule of list) {
			if ("selectorText" in rule) {
				let where = ":where(." + tag + ") ";

				rule.selectorText = (rule.selectorText as string)
					.replace(globalWhereTransformation, GLOBAL)
					.replace(componentWhereTransformation, where)
					.split(",")
					.map((x) => x.trim())
					.map((x) => {
						return x.startsWith(GLOBAL)
							? x.substring(8, x.length - 1)
							: x.replace(" ", where) + where;
					})
					.join(",")
					.replace(":scope", `.${tag}.${cssComponent}`);
			}
			if ("cssRules" in rule) {
				rewriteRules(Array.from(rule.cssRules as CSSRuleList));
			}
		}

		return list;
	}

	return rewriteRules(
		getRules(
			css
				.replace(GLOBAL, globalWhereTransformation)
				.replace(COMPONENT, componentWhereTransformation)
		)
	)
		.map((x) => x.cssText)
		.join("\n");
}

function rewriteScoped(css: CSSRule[], tag: string): string {
	let cssText = css.map((x) => x.cssText).join("");
	return `@scope (.${tag}.${cssComponent}) to (:not(.${tag}).${cssBoundary}) { ${cssText} }`;
}

function getRules(css: string): CSSRule[] {
	let sheet = new CSSStyleSheet();
	sheet.replaceSync(css);
	return Array.from(sheet.cssRules);
}

export function rewriteCSS(css: DLCSS, tag: string): string {
	if (css._cascade) {
		return rewriteCascading(css.css, tag);
	} else {
		return rewriteScoped(getRules(css.css), tag);
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
