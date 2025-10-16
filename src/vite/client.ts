import { CSS_COMPONENT, CSS_IDENT, rewriteCss } from "dreamland/core";

import type { DreamlandCssUpdate } from "./hmrPayload";

let REGISTRY_KEY = "__dreamland_css_hmr_registry__";

let getRegistry = (): Map<string, string> => {
	let global =
		typeof globalThis !== "undefined" ? (globalThis as any) : undefined;
	let existing = global?.[REGISTRY_KEY];
	if (existing instanceof Map) return existing;
	let map = new Map<string, string>();
	if (global) global[REGISTRY_KEY] = map;
	return map;
};

export let applyDreamlandCssUpdates = (updates: DreamlandCssUpdate[]) => {
	let doc = document;
	let registry = getRegistry();

	for (let update of updates) {
		registry.set(update.component, update.css);

		let selector = `style[${CSS_COMPONENT}="${update.component}"]`;
		let styleEl = doc.querySelector(selector);
		if (!(styleEl instanceof HTMLStyleElement)) continue;

		let tag = styleEl.getAttribute(`${CSS_IDENT}id`);
		if (!tag) continue;

		rewriteCss(styleEl, update.css, tag);
	}
};
