import { Component, ComponentChild, css, h } from "dreamland/core";
import { Transform } from "./transforms";
import { CSS_POS_ABSOLUTE } from "./utils";

export let Cube: Component<{ width?: number, height?: number, depth?: number, children: [ComponentChild, ComponentChild, ComponentChild, ComponentChild, ComponentChild, ComponentChild] }> = function (cx) {
	this.width ??= 100;
	this.height ??= 100;
	this.depth ??= 100;
	
	return (
		<div class="dl3d-cube">
			<Transform z={use(this.depth).map(d => d / 2)}>
				{cx.children[0]}
			</Transform>
			<Transform z={use(this.depth).map(d => -d / 2)} angleY={180}>
				{cx.children[1]}
			</Transform>

			<Transform x={use(this.width).map(w => -w / 2)} angleY={-90}>
				{cx.children[2]}
			</Transform>
			<Transform x={use(this.width).map(w => w / 2)} angleY={90}>
				{cx.children[3]}
			</Transform>

			<Transform y={use(this.height).map(h => -h / 2)} angleX={90}>
				{cx.children[4]}
			</Transform>
			<Transform y={use(this.height).map(h => h / 2)} angleX={-90}>
				{cx.children[5]}
			</Transform>
		</div>
	)
}
Cube.style = css<typeof Cube>`
	:scope {
		width: ${x => use(x.width).map(x=>x + "px")};
		height: ${x => use(x.height).map(x=>x + "px")};
		transform-style: preserve-3d;
	}
	${CSS_POS_ABSOLUTE}
`;
