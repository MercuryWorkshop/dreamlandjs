import { css, type FC, type ComponentChild, NO_CHANGE } from "dreamland/core";
import normal from "./logo/normal.svg";

// @ts-expect-error dl:bundle doesn't have types
import { version } from "dl:bundle";

export function ExternalLink(
	this: FC<{
		href: string;
		children: ComponentChild;
		label?: string;
	}>
) {
	return (
		<a href={this.href} target="_blank" aria-label={this.label}>
			{this.children}
		</a>
	);
}

export function MdiIcon(this: FC<{ icon: string; viewBox?: string }, { [NO_CHANGE]: true }>) {
	this.viewBox ??= "0 0 24 24";
	this[NO_CHANGE] = true;

	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox={this.viewBox}>
			<path d={use(this.icon)} />
		</svg>
	);
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

export function Hero(this: FC<{ version?: boolean }>) {
	this.version ??= false;

	return (
		<div class="hero">
			<img src={normal} alt="dreamland logo" width="400" height="400" />
			<span>dreamland</span>

			{this.version ? <div class="version">v{version}</div> : null}
		</div>
	);
}
Hero.style = css`
	:scope {
		display: grid;
		gap: 0 0.5rem;
		align-items: center;
		grid-template-columns: 1.5em 1fr;
		grid-template-areas:
			"a b"
			". c";

		font-weight: bold;
	}
	img {
		grid-area: a;
		height: 1.5em;
		width: 1.5em;
	}
	span {
		grid-area: b;
	}

	.version {
		grid-area: c;
		font-size: 0.5em;
		font-weight: normal;
		font-style: italic;
	}
`;
