import { css, type FC } from "dreamland/core";
import { Link, RouterState } from "dreamland/router";

// rollup hack
import "../playground/setup";

import { Hero } from "../utils";

export function PlaygroundLoading(this: FC) {
	return (
		<div>
			<h2>
				<b>Loading web IDE...</b>
			</h2>
		</div>
	);
}
PlaygroundLoading.style = css`
	:scope {
		width: 100%;
		height: 100%;

		display: flex;
		align-items: center;
		justify-content: center;
	}
`;

export function PlaygroundHost(this: FC<{ routerState: RouterState }>) {
	this.cx.pageTitle = "Playground";

	return (
		<div>
			<div class="head">
				<Link href="/">
					<Hero />
				</Link>
				Playground
			</div>
			<div class="main">
				{use(this.routerState.outlet).or(<PlaygroundLoading />)}
			</div>
		</div>
	);
}
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
`;

export function showPlayground() {
	if (!import.meta.env.SSR) {
		return import("../playground/playground").then((r) => <r.default />);
	}
}
