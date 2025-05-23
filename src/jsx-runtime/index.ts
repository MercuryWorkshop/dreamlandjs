import {
	Component,
	ComponentInstance,
	h,
	DLElementNameToElement,
} from "dreamland/core";

function jsx<T extends Component<any, any, any>>(
	init: T,
	props: Record<string, any> | null,
	key: string | undefined
): ComponentInstance<T>;
function jsx<T extends string>(
	init: T,
	props: Record<string, any> | null,
	key: string | undefined
): DLElementNameToElement<T>;
function jsx(
	type: any,
	props: Record<string, any> | null,
	key: string | undefined
): HTMLElement {
	let { children, ...mapped } = props;
	if (children === undefined) children = [];
	if (key) mapped.key = key;
	return h(
		type,
		mapped,
		...(children instanceof Array ? children : [children])
	);
}

export { jsx as jsx, jsx as jsxs, jsx as jsxDEV };
