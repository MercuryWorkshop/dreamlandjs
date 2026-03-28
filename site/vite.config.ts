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

let appBundleSize =
	"export default" + JSON.stringify(await computeAppBundleSize());
let frameworkInfo = Object.entries(await getFrameworkInfo())
	.map((x) => `export let ${x[0]} = ${JSON.stringify(x[1])};`)
	.join("\n");

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
		chunkSizeWarningLimit: Infinity,
		rolldownOptions: {
			checks: {
				pluginTimings: false,
			},
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
			load: {
				filter: {
					id: /^.*\?frontmatter=true$/,
				},
				async handler(_id) {
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
		},
		{
			name: "dl-framework-bundle",
			enforce: "pre",
			resolveId: {
				filter: {
					/* @ts-expect-error regexp.escape */ id: new RegExp(
						RegExp.escape("dl:frameworks")
					),
				},
				handler() {
					return "\0dl:frameworks";
				},
			},
			load: {
				filter: {
					/* @ts-expect-error regexp.escape */
					id: new RegExp(RegExp.escape("\0dl:frameworks")),
				},
				handler() {
					return appBundleSize;
				},
			},
		},
		{
			name: "dl-examples",
			enforce: "pre",
			load: {
				filter: {
					id: /^.*src\/examples\/.*\.tsx$/,
				},
				async handler(id) {
					let file = await readFile(id);

					return `
						${file}

						${await compileMdx("```tsx\n" + file + "\n```", "Code")}
					`;
				},
			},
		},
		{
			name: "dl-bundle",
			enforce: "pre",
			resolveId: {
				filter: {
					/* @ts-expect-error regexp.escape */ id: new RegExp(
						RegExp.escape("dl:bundle")
					),
				},
				handler() {
					return "\0dl:bundle";
				},
			},
			load: {
				filter: {
					/* @ts-expect-error regexp.escape */ id: new RegExp(
						RegExp.escape("\0dl:bundle")
					),
				},
				handler() {
					return frameworkInfo;
				},
			},
		},
	],
});
