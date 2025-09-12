import { defineConfig } from "vite";
import { devSsr } from "dreamland/vite";
import { compile } from "@mdx-js/mdx";

import { readFile } from "fs/promises";
import { gzipSync, brotliCompressSync } from "zlib";

export default defineConfig({
	plugins: [
		devSsr({
			entry: "/src/main-server.ts",
		}),
		{
			name: "dl-bundle-size",
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

					const ssr = await readFile("node_modules/dreamland/dist/ssr.client.js");

					return {
						code: `
							export let dl = { bundle: "${(uncompressed / 1024).toFixed(1)}", gzip: "${(gzip / 1024).toFixed(1)}", brotli: "${(brotli / 1024).toFixed(1)}" };
							export let ssr = "${(ssr.byteLength / 1024).toFixed(1)}";
						`,
					}
				}
			}
		},
		{
			name: "mdx-dreamland",
			enforce: "pre",
			async load(id) {
				if (id.endsWith(".mdx")) {
					const content = await readFile(id, "utf-8");
					const compiled = await compile(content, {
						outputFormat: "program",
						jsxImportSource: "dreamland",
					});
					return {
						code: `
							${compiled.toString().replace("export default", "export")}

							export default function Page() {
								const {wrapper: MDXLayout} = this.components || ({});
								return (
									MDXLayout 
										? _jsx(MDXLayout, { children: [_createMdxContent(this)], ...this })
										: _jsx(_Fragment, { children: [_createMdxContent(this)], ...this })
								)
							}
						`,
						loader: "jsx",
					};
				}
			},
		},
	],
});
