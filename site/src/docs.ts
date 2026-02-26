import type { Component } from "dreamland/core";

export interface DocPage {
	type: "page";
	path: string;
	groups: string[];
	title: string;
	order: number;
}

export interface DocGroup {
	type: "group";
	title: string;
	children: (DocGroup | DocPage)[];
}

let mapPath = (path: string) => path.replace("./docs/", "").replace(".mdx", "");

export let docs: DocPage[] = Object.entries(
	import.meta.glob("./docs/**/*.mdx", {
		eager: true,
		import: "frontmatter",
		query: { frontmatter: true },
	})
)
	.map(
		([path, meta]: [string, any]) =>
			({
				type: "page",
				path: mapPath(path),
				groups: meta.title,
				title: meta.title[meta.title.length - 1],
				order: meta.order || 0,
			}) as const
	)
	.sort((a, b) => a.order - b.order);

export let docComponents: [string, () => Promise<Component>][] = Object.entries(
	import.meta.glob("./docs/**/*.mdx")
).map(([path, module]) => [
	mapPath(path),
	() => module().then((r: any) => r.default),
]);

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
