import { css, type Component, type ComponentChild } from "dreamland/core";

const Button: Component<{
	children: ComponentChild;
}> = function (cx) {
	return <button on:click={() => alert()}>{cx.children}</button>;
};
Button.style = css`
	:scope {
		background: var(--accent);
		color: var(--bg-1);
		border: none;
		border-radius: 0.5rem;
	}
`;

export const StyledPage: Component = function () {
	return (
		<div>
			<Button>Click!</Button>
		</div>
	);
};
