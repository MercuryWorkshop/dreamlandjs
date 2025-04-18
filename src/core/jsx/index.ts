import { DREAMLAND_INTERNAL, VNODE } from "../consts";
import { VNode } from "./vdom";

export * from "./vdom";

function jsxFactory(type: any, props: { [index: string]: any } | null, ...children: (VNode | string)[]): VNode {
	dev: {
		if (!["string", "function"].includes(typeof type)) throw "invalid component";
	}

	return {
		[DREAMLAND_INTERNAL]: VNODE,
		_init: type,
		_children: children,
		_props: props,
	}
}

export const h = jsxFactory;
