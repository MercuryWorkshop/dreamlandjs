import { css, type FC } from "dreamland/core";

// @ts-expect-error dl:frameworks untyped
import _frameworks from "dl:frameworks";
let frameworks = _frameworks as {
	name: string;
	bundle: number;
	gzip: number;
	brotli: number;
}[];
frameworks.sort((a, b) => a.brotli - b.brotli);

let max = frameworks[frameworks.length - 1].brotli;

let format = (bytes: number) => (bytes / 1024).toFixed(1);

export function BundleSize(this: FC) {
	return (
		<div>
			{frameworks.map(({ name, bundle, brotli }) => (
				<>
					<div class="name">{name}</div>
					<div
						class="bar"
						class:dreamland={name === "dreamland"}
						style={{ "--size": brotli / max }}
					/>
					<div class="value">
						{format(brotli)}kb <span>{format(bundle)}kb min</span>
					</div>
				</>
			))}
		</div>
	);
}
BundleSize.style = css`
	:scope {
		display: grid;
		grid-template-columns: min-content 1fr auto;
		grid-auto-rows: 1.5rem;
		gap: 0.5rem 1rem;

		align-items: center;
	}

	.name {
		white-space: nowrap;
	}

	.bar {
		width: max(3px, var(--size) * 100%);
		height: 100%;

		background: var(--bg-3);
		border-radius: 0.25rem;

		justify-self: start;
	}

	.dreamland {
		background: var(--accent);
	}

	.value {
		white-space: nowrap;
	}

	.value span {
		opacity: 0.6;
	}
`;
