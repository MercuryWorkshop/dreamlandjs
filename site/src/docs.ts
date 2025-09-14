import type { Component } from "dreamland/core";

export interface DocPage {
	type: "page";
	path: string;
	groups: string[];
	title: string;
	component: Component<{}>;
	order: number;
}

export interface DocGroup {
	type: "group";
	title: string;
	children: (DocGroup | DocPage)[];
}

export let docs: DocPage[] = Object.entries(
	import.meta.glob("./docs/**/*.mdx", { eager: true })
)
	.map(([path, module]: [string, any]) => {
		return {
			type: "page",
			path: path.replace("./docs/", "").replace(".mdx", ""),
			groups: module.title,
			title: module.title.at(-1),
			component: module.default,
			order: module.order || 0,
		} as const;
	})
	.sort((a, b) => a.order - b.order);

export let groups: (DocGroup | DocPage)[] = [];
for (let page of docs) {
	let children: (DocGroup | DocPage)[] = groups;
	for (let part of page.groups.slice(0, page.groups.length - 1)) {
		let group = children.find((x) => x.type === "group" && x.title === part) as
			| DocGroup
			| undefined;
		if (!group) {
			group = { type: "group", title: part, children: [] };
			children.push(group);
		}
		children = group.children;
	}

	children.push(page);
}
