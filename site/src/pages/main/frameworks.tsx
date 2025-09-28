import { css, type Component } from "dreamland/core";

// @ts-expect-error dl:frameworks untyped
import _frameworks from "dl:frameworks";
let frameworks = _frameworks as [string, number][];
frameworks.sort((a, b) => a[1] - b[1]);

let min = frameworks[0][1];
let max = frameworks[frameworks.length - 1][1];

let bundles = frameworks.map(([name, size]) => ({
	name,
	size,
	relative: (size - min) / (max - min),
}));

export let BundleSize: Component = function() {
	return (
		<div>
			{bundles.map(({ name, size, relative }) => <>
				<div class="name">
					{name}
				</div>
				<div class="bar" class:dreamland={name.startsWith("Dreamland")} style={{ "--size": relative }}>
					<div>{(size / 1024).toFixed(2)}kb</div>
				</div>
			</>)}
		</div>
	)
}
BundleSize.style = css`
	:scope {
		display: grid;
		grid-template-columns: min-content 1fr;
		grid-auto-rows: 2rem;
		gap: 0.5rem 1.5rem;

		align-items: center;
	}

	.bar {
		height: 100%;
	}

	.name {
		white-space: nowrap;
	}

	.bar div {
		width: calc(35% + var(--size) * 65%);
		height: 100%;

		background: var(--bg-3);

		display: flex;
		justify-content: flex-end;
		align-items: center;
		padding: 0 1rem;
		border-radius: 0.5rem;
	}

	.dreamland div {
		background: var(--accent) 50%;
		color: var(--bg-1);
	}
`;
