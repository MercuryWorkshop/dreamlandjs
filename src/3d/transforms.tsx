import { Component, ComponentChild, css, h } from "dreamland/core";
import { CSS_POS_ABSOLUTE } from "./utils";

export let Transform: Component<{ x?: number, y?: number, z?: number, angleX?: number, angleY?: number, angleZ?: number,  children: ComponentChild }> = function (cx) {
	this.x ??= 0;
	this.y ??= 0;
	this.z ??= 0;
	this.angleX ??= 0;
	this.angleY ??= 0;
	this.angleZ ??= 0;

	return (
		<div>
			{cx.children}
		</div>
	)
}
Transform.style = css<typeof Transform>`
	:scope {
		transform:
			translate3d(${x => use(x.x).map(x => x + "px")}, ${x => use(x.y).map(x => x + "px")}, ${x => use(x.z).map(x => x + "px")})
			rotateX(${x => use(x.angleX).map(x => x + "deg")}) rotateY(${x => use(x.angleY).map(x => x + "deg")}) rotateZ(${x => use(x.angleZ).map(x => x + "deg")});
		transform-style: preserve-3d;
	}
`;

export let Camera: Component<{ x?: number, y?: number, z?: number, angleX?: number, angleY?: number, angleZ?: number,  children: ComponentChild }> = function (cx) {
	this.x ??= 0;
	this.y ??= 0;
	this.z ??= 0;
	this.angleX ??= 0;
	this.angleY ??= 0;
	this.angleZ ??= 0;

	return (
		<div>
			{cx.children}
		</div>
	)
}
Camera.style = css<typeof Camera>`
	:scope {
		position: relative;
		transform:
			rotateX(${x => use(x.angleX).map(x => x + "deg")}) rotateY(${x => use(x.angleY).map(x => x + "deg")}) rotateZ(${x => use(x.angleZ).map(x => x + "deg")})
			translate3d(${x => use(x.x).map(x => x + "px")}, ${x => use(x.y).map(x => x + "px")}, ${x => use(x.z).map(x => x + "px")});
		transform-style: preserve-3d;
	}

	${CSS_POS_ABSOLUTE}
`;
