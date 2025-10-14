import type { Component } from "dreamland/core";

export interface Example {
	id: string;
	component: Component<{}>;
	code: Component<{}>;
}

export let examples: Example[] = Object.entries(
	import.meta.glob("./examples/*.tsx", { eager: true })
).map(([path, module]: [string, any]) => {
	let name = path.replace("./examples/", "").replace(".tsx", "");
	return {
		id: name.toLowerCase(),
		component: module[name],
		code: module.Code,
	};
});
