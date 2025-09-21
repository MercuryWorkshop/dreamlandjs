import { css, type Component, type ComponentChild } from "dreamland/core";

export let ExternalLink: Component<{
	href: string;
	children: ComponentChild;
}> = function(cx) {
	return (
		<a href={this.href} target="_blank">
			{cx.children}
		</a>
	);
};

export let MdiIcon: Component<{ icon: string, viewBox?: string }> = function() {
	this.viewBox ??= "0 0 24 24";

	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox={this.viewBox}><path d={use(this.icon)} /></svg>
	)
}
MdiIcon.style = css`
	:scope {
		width: 1em;
		height: 1em;
	}
	:scope path {
		fill: currentColor;
	}
`;
