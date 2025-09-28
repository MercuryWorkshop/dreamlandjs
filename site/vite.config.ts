import { defineConfig } from "vite";
import { devSsr } from "dreamland/vite";
import { compile } from "@mdx-js/mdx";
import { literalsHtmlCssMinifier } from "@literals/rollup-plugin-html-css-minifier";

import rehypeStarryNight from "rehype-starry-night";
import { all as grammars } from "@wooorm/starry-night";
import { visit } from "estree-util-visit";

import { readFile } from "fs/promises";
import { gzipSync, brotliCompressSync } from "zlib";

import bundleSize from "./util/bundle-size";

async function compileMdx(content: string, name?: string) {
	const compiled = await compile(content, {
		outputFormat: "program",
		jsxImportSource: "dreamland",
		rehypePlugins: [[rehypeStarryNight, { grammars }]],
		recmaPlugins: [
			() => (tree) =>
				visit(tree, (node) => {
					// this is scuffed but works. no idea why mdx doesn't support using class
					if (
						node.type === "CallExpression" &&
						node.callee.type === "Identifier" &&
						node.callee.name.startsWith("_jsx") &&
						node.arguments[1]?.type === "ObjectExpression"
					) {
						for (let prop of node.arguments[1].properties) {
							if (
								prop.type === "Property" &&
								prop.key.type === "Identifier" &&
								prop.key.name === "className"
							) {
								prop.key.name = "class";
							}
						}
					}
				}),
		],
	});

	return `
		${compiled.toString().replace("export default", "export")}

		export ${name ? `function ${name}()` : `default function Page()`} {
			const {wrapper: MDXLayout} = this.components || ({});
			return (
				MDXLayout 
					? _jsx(MDXLayout, { children: [_createMdxContent(this)], ...this })
					: _createMdxContent(this)
			)
		}
	`;
};

export default defineConfig({
	plugins: [
		literalsHtmlCssMinifier({
			include: ["src/**/*.tsx"],
		}),
		devSsr({
			entry: "/src/main-server.ts",
		}),
		{
			name: "dl-framework-bundle",
			enforce: "pre",
			resolveId(id) {
				if (id === "dl:frameworks") return "\0dl:frameworks";
			},
			async load(id) {
				if (id === "\0dl:frameworks") {
					return {
						code: `export default ${JSON.stringify(await bundleSize())}`
					}
				}
			}
		},
		{
			name: "dl-examples",
			enforce: "pre",
			async load(id) {
				if (/^.*src\/examples\/.*\.tsx$/.test(id)) {
					let file = await readFile(id);

					return `
						${file}

						${await compileMdx("```tsx\n"+file+"\n```", "Code")}
					`;
				}
			}
		},
		{
			name: "dl-bundle",
			enforce: "pre",
			resolveId(id) {
				if (id === "dl:bundle") return "\0dl:bundle";
			},
			async load(id) {
				if (id === "\0dl:bundle") {
					const bundle = await readFile("node_modules/dreamland/dist/core.js");
					const uncompressed = bundle.byteLength;
					const gzip = gzipSync(bundle).byteLength;
					const brotli = brotliCompressSync(bundle).byteLength;

					const ssr = await readFile(
						"node_modules/dreamland/dist/ssr.client.js"
					);

					const packageJson = JSON.parse(
						await readFile("node_modules/dreamland/package.json", "utf-8")
					);

					return {
						code: `
							export let dl = { bundle: "${(uncompressed / 1024).toFixed(1)}", gzip: "${(gzip / 1024).toFixed(1)}", brotli: "${(brotli / 1024).toFixed(1)}" };
							export let ssr = "${(ssr.byteLength / 1024).toFixed(1)}";
							export let version = "${packageJson.version}";
						`,
					};
				}
			},
		},
		{
			name: "mdx-dreamland",
			enforce: "pre",
			async load(id) {
				if (id.endsWith(".mdx")) {
					const content = await readFile(id, "utf-8");

					return {
						code: await compileMdx(content),
						loader: "jsx",
					};
				}
			},
		},
	],
});
