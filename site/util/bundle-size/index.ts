// compile and bundle many competing frameworks for prod, compare size

import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as svelte from "svelte/compiler";
import { minify } from "terser";

async function bundleFile(
	codePath: string,
	terser: boolean,
	jsxImportSource: string
): Promise<Uint8Array> {
	let code = await readFile(resolve(import.meta.dirname, codePath), "utf-8");
	return await bundle(code, terser, jsxImportSource);
}

async function bundle(
	code: string,
	terser: boolean,
	jsxImportSource?: string
): Promise<Uint8Array> {
	let built = await build({
		stdin: {
			contents: code,
			resolveDir: resolve(import.meta.dirname, "../../"),
			loader: "tsx",
		},
		jsx: jsxImportSource ? "automatic" : undefined,
		jsxImportSource,
		target: "esnext",

		bundle: true,
		minify: true,
		treeShaking: true,
		write: false,

		conditions: ["production"],
	});

	let builtCode = built.outputFiles[0].text;

	let minified = terser ? (await minify(builtCode)).code! : builtCode;
	return new TextEncoder().encode(minified);
}

// svelte is weird
async function svelteInput(codePath: string): Promise<string> {
	let code = await readFile(resolve(import.meta.dirname, codePath), "utf-8");
	let compiled = svelte.compile(code, {
		name: "Counter",
		dev: false,
		hmr: false,
	});

	return `${compiled.js.code}\nnew Counter({ target: document.querySelector("#app") });`;
}

export default async function () {
	let dreamland = await bundleFile("dreamland.tsx", false, "dreamland");
	let react = await bundleFile("react.tsx", false, "react");
	let solid = await bundleFile("solid.tsx", false, "solid-js/h");

	// esbuild isn't evaling the constant so svelte needs terser
	let svelte = await bundle(await svelteInput("svelte.svelte"), true);

	return [
		["Dreamland", dreamland.byteLength],
		["React", react.byteLength],
		["SolidJS", solid.byteLength],
		["Svelte", svelte.byteLength],
	];
}
