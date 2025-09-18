import { css, type Component } from "dreamland/core";

// rollup hack
import "../playground/setup";

export let PlaygroundHost: Component<{}, { host?: HTMLElement }, { "on:routeshown": () => void }> = function() {
	this["on:routeshown"] = async () => {
		if (!import.meta.env.SSR) {


			let playground = await import("../playground/playground");
			this.host = <playground.Playground />
		}
	}

	return (
		<div>{use(this.host).andThen((x: any) => x, (
			<div class="loading">
				<h2><b>Loading playground...</b></h2>
			</div>
		))}</div>
	)
}
PlaygroundHost.style = css`
	:scope, .loading {
		width: 100%;
		height: 100%;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
	}
`;
