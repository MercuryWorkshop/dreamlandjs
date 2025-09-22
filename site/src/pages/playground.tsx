import { css, type Component } from "dreamland/core";

// rollup hack
import "../playground/setup";
import { setTitle } from "../main";

import { Link } from "../../../dist/router";
import { Hero } from "../utils";

export let PlaygroundHost: Component<
	{},
	{ host?: HTMLElement },
	{ "on:routeshown": () => void }
> = function () {
	this["on:routeshown"] = async () => {
		if (!import.meta.env.SSR) {
			let playground = await import("../playground/playground");
			this.host = <playground.Playground />;
		}

		setTitle("Playground");
	};

	return (
		<div>
			<div class="head">
				<Link href="/">
					<Hero />
				</Link>
				Playground
			</div>
			<div class="main">
				{use(this.host).andThen(
					(x: any) => x,
					<div class="loading">
						<h2>
							<b>Loading web IDE...</b>
						</h2>
					</div>
				)}
			</div>
		</div>
	);
};
PlaygroundHost.style = css`
	:scope {
		width: 100%;
		height: 100%;

		display: flex;
		flex-direction: column;
	}

	.head {
		padding: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;

		font-size: 1.5rem;
		font-weight: bold;
	}

	.head :global(a) {
		text-decoration: none;
	}
	.head :global(a):hover {
		text-decoration: underline;
	}

	.expand {
		flex: 1;
	}

	.main {
		flex: 1;
	}

	.loading {
		width: 100%;
		height: 100%;

		display: flex;
		align-items: center;
		justify-content: center;
	}
`;
