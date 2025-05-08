import { h } from "dreamland/core";

function jsx(
	type: any,
	props: Record<string, any> | null,
	key: string | undefined
): HTMLElement {
	let mapped = Object.fromEntries(
		Object.entries(props).filter((x) => x[0] !== "children")
	);
	if (key) mapped.key = key;
	let children = props.children;
	return h(
		type,
		mapped,
		...(children instanceof Array ? children : [children])
	);
}

export { jsx as jsx, jsx as jsxs, jsx as jsxDEV };
