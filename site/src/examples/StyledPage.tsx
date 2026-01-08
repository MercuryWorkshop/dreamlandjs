import { css, type FC, type ComponentChild } from "dreamland/core";

function Button(this: FC<{ children: ComponentChild }>) {
	return <button on:click={() => alert()}>{this.children}</button>;
}
Button.style = css`
	:scope {
		background: var(--accent);
		color: var(--bg-1);
		border: none;
		border-radius: 0.5rem;
	}
`;

export function StyledPage(this: FC) {
	return (
		<div>
			<Button>Click!</Button>
		</div>
	);
}
