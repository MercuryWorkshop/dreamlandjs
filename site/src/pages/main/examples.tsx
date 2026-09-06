import { css, type FC } from "dreamland/core";
import { examples, type Example } from "../../examples";

export function ExampleView(this: FC<{ example: Example }>) {
	return (
		<div data-example={this.example.id}>
			<div class="code">
				<this.example.code />
			</div>
			<div class="example">
				<this.example.component />
			</div>
		</div>
	);
}
ExampleView.style = css`
	:scope {
		flex: 0 0 100%;
		min-width: 0;
		scroll-snap-align: start;

		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.code {
		min-height: 0;
	}

	.code > :global(pre) {
		margin: 0;
		height: 100%;

		border-radius: 0.5rem 0.5rem 0.1rem 0.1rem;
	}

	.code > :global(pre) > :global(code) {
		overflow: auto auto;
	}

	.example {
		background: var(--bg-3);
		padding: 0.5rem;
		border-radius: 0.1rem 0.1rem 0.5rem 0.5rem;

		flex: 1 0;
	}

	.example :global(:is(h1, h2, h3, h4)) {
		margin: 0 0 0.5rem 0;
	}
`;

export function ExamplesCarousel(this: FC) {
	return (
		<div>
			{examples.map((x) => (
				<ExampleView example={x} />
			))}
		</div>
	);
}
ExamplesCarousel.style = css`
	:scope {
		display: flex;
		gap: 0.5rem;
		overflow: scroll hidden;

		scroll-snap-type: x mandatory;

		height: 27.5rem;
	}
`;
