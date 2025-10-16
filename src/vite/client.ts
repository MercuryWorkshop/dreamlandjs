import { CSS_COMPONENT, CSS_IDENT, rewriteCss } from "dreamland/core";

import type { DreamlandCssUpdate } from "./hmrPayload";

export let applyDreamlandCssUpdates = (updates: DreamlandCssUpdate[]) => {
	let doc = document;

	for (let update of updates) {
		let selector = `style[${CSS_COMPONENT}="${update.component}"]`;
		let styleEl = doc.querySelector(selector);
		if (!(styleEl instanceof HTMLStyleElement)) continue;

		let tag = styleEl.getAttribute(`${CSS_IDENT}id`);
		if (!tag) continue;

		rewriteCss(styleEl, update.css, tag);
	}
};
