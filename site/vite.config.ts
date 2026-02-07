import { defineConfig } from "vite";
import { devSsr, cssMinifier } from "dreamland/vite";

// @ts-expect-error @types import needed
import type { Node } from "@types/estree-jsx";
import mdx from "@mdx-js/rollup";
import rehypeStarryNight from "rehype-starry-night";
import remarkFrontmatter from "remark-frontmatter";
import { compile, ProcessorOptions } from "@mdx-js/mdx";
import { all as grammars } from "@wooorm/starry-night";
import { SKIP, visit } from "estree-util-visit";
import { read as readVFile } from "to-vfile";
import { matter } from "vfile-matter";

import { readFile } from "node:fs/promises";

import computeAppBundleSize from "./util/app-bundle-size";
import { getFrameworkInfo } from "./util/framework-info";

let appBundleSize = await computeAppBundleSize();
let frameworkInfo = await getFrameworkInfo();

function recmaUseThis() {
	return (tree: any) => {
		visit(tree, (node) => {
			if (node.type === "ExportDefaultDeclaration") {
				let decl = node.declaration;
				if (
					decl.type === "FunctionDeclaration" &&
					decl.params[0]?.type === "AssignmentPattern" &&
					decl.params[0].left.type === "Identifier" &&
					decl.params[0].left.name === "props"
				) {
					decl.params = [];
					visit(decl.body, (decl) => {
						if (decl.type === "Identifier" && decl.name === "props") {
							decl.name = "this";
						}
					});
				}
			}
		});
	};
}

function recmaRenameDefault(name: string) {
	return () => (tree: any) => {
		visit(tree, (node, key, index, ancestors) => {
			let parent: any = ancestors.at(-1);
			if (
				parent &&
				key &&
				index !== undefined &&
				node.type === "ExportDefaultDeclaration"
			) {
				let decl = node.declaration;
				if (decl.type === "FunctionDeclaration" && decl.id) {
					decl.id.name = name;
					let newNode: Node = {
						type: "ExportNamedDeclaration",
						specifiers: [],
						attributes: [],
						declaration: decl as any,
					};

					parent[key][index] = newNode;

					return SKIP;
				}
			}
		});
	};
}

let mdxConfig = (recma: any[] = []) =>
	({
		outputFormat: "program",
		jsxImportSource: "dreamland",
		remarkPlugins: [remarkFrontmatter],
		rehypePlugins: [[rehypeStarryNight, { grammars }]],
		recmaPlugins: [recmaUseThis, ...recma],
		stylePropertyNameCase: "css",
		elementAttributeNameCase: "html",
	}) satisfies ProcessorOptions;

async function compileMdx(content: string, name?: string) {
	return await compile(
		content,
		mdxConfig(name ? [recmaRenameDefault(name)] : [])
	);
}

export default defineConfig({
	build: {
		rollupOptions: {
			output: {
				manualChunks: (id) => {
					if (id.includes("monaco-editor")) {
						return "monaco";
					}
				},
			},
		},
	},
	plugins: [
		cssMinifier({
			include: ["src/**/*.tsx"],
		}),
		devSsr({
			entry: "/src/main-server.ts",
		}),
		mdx(mdxConfig()),
		{
			name: "mdx-frontmatter",
			enforce: "pre",
			async load(_id) {
				let [id, query] = _id.split("?");
				if (query === "frontmatter=true") {
					let vfile = await readVFile(id);
					matter(vfile);
					return {
						code: `export let frontmatter = ${JSON.stringify(vfile.data.matter)}`,
					};
				}
			},
		},
		{
			name: "dl-framework-bundle",
			enforce: "pre",
			resolveId(id) {
				if (id === "dl:frameworks") return "\0dl:frameworks";
			},
			async load(id) {
				if (id === "\0dl:frameworks") {
					return `export default ${JSON.stringify(appBundleSize)}`;
				}
			},
		},
		{
			name: "dl-examples",
			enforce: "pre",
			async load(id) {
				if (/^.*src\/examples\/.*\.tsx$/.test(id)) {
					let file = await readFile(id);

					return `
						${file}

						${await compileMdx("```tsx\n" + file + "\n```", "Code")}
					`;
				}
			},
		},
		{
			name: "dl-bundle",
			enforce: "pre",
			resolveId(id) {
				if (id === "dl:bundle") return "\0dl:bundle";
			},
			async load(id) {
				if (id === "\0dl:bundle") {
					return Object.entries(frameworkInfo)
						.map((x) => `export let ${x[0]} = ${JSON.stringify(x[1])};`)
						.join("\n");
				}
			},
		},
	],
});
