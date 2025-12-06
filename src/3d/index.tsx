import { Component, ComponentChild, css, h } from "dreamland/core";
import { CSS_POS_ABSOLUTE } from "./utils";

export let Stage3D: Component<{ perspective?: number, children: ComponentChild }> = function (cx) {
	this.perspective ??= 1000;

	return (
		<div class="dl3d-stage">
			<div>
				{cx.children}
			</div>
		</div>
	)
}
Stage3D.style = css<typeof Stage3D>`
	:scope {
		perspective: ${x => use(x.perspective).map(x => x + "px")};
		overflow: hidden;
		position: relative;
	}

	:scope > div {
		transform-style: preserve-3d;
		transform: translate3d(500px, 500px, ${x => use(x.perspective).map(x => x + "px")});
	}

	:scope > div > :global(*) {
		position: absolute;
		transform-style: preserve-3d;
	}
`;

export * from "./transforms";
export * from "./objects";
