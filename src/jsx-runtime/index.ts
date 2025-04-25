import { VNode, h } from "dreamland/core";

function jsx(
	type: any,
	props: Record<string, any> | null,
	key: string | undefined
): VNode {
	let mapped = Object.fromEntries(
		Object.entries(props).filter((x) => x[0] !== "children")
	);
	mapped.key = key;
	return h(type, mapped, props.children);
}

export { jsx as jsx, jsx as jsxs, jsx as jsxDEV };
