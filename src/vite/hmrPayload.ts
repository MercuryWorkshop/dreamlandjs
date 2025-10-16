export const DREAMLAND_CSS_EVENT = "dreamland:css-update" as const;

export type DreamlandCssUpdate = {
	component: string;
	css: string;
};

export type DreamlandCssHmrMessage = {
	file: string;
	updates: DreamlandCssUpdate[];
};
