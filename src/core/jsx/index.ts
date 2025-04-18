import { DREAMLAND_INTERNAL } from "../consts";
import { VNode } from "./vdom";

export * from "./vdom";

function jsxFactory(type: any, props: { [index: string]: any } | null, ...children: (VNode | string)[]): VNode {
	if (!["string", "function"].includes(typeof type)) throw "invalid component";

	return {
		[DREAMLAND_INTERNAL]: true,
		init: type,
		children,
		props,
	}
}

export const h = jsxFactory;
