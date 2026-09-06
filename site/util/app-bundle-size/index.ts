// compile and bundle many competing frameworks for prod, compare size

import { transformAsync } from "@babel/core";
// @ts-expect-error babel-preset-solid untyped
import solid from "babel-preset-solid";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as svelte from "svelte/compiler";
import { minify } from "terser";

import { computeBundleSize, type BundleSize } from "../compression.ts";

let read = (path: string) =>
	readFile(resolve(import.meta.dirname, path), "utf-8");

// solid's jsx compiles to cloned templates, so bundling it with a generic jsx
// runtime (or solid-js/h) would measure a solid nobody actually ships
async function solidInput(path: string): Promise<string> {
	let compiled = await transformAsync(await read(path), {
		filename: path,
		babelrc: false,
		configFile: false,
		presets: [[solid, { generate: "dom", hydratable: false }]],
	});

	return compiled!.code!;
}

// svelte is weird
async function svelteInput(path: string): Promise<string> {
	let compiled = svelte.compile(await read(path), {
		name: "Counter",
		filename: path,
		generate: "client",
		dev: false,
		hmr: false,
	});

	return `import { mount } from "svelte";
${compiled.js.code}
mount(Counter, { target: document.querySelector("#app") });`;
}

interface Framework {
	name: string;
	input: () => Promise<string>;
	jsxImportSource?: string;
}

// every app renders the same markup and mounts into the same #app node, using
// whatever each framework documents as its own entrypoint
export let frameworks: Framework[] = [
	{
		name: "dreamland",
		input: () => read("dreamland.tsx"),
		jsxImportSource: "dreamland",
	},
	{
		name: "Preact",
		input: () => read("preact.tsx"),
		jsxImportSource: "preact",
	},
	{ name: "SolidJS", input: () => solidInput("solid.jsx") },
	{ name: "Svelte", input: () => svelteInput("svelte.svelte") },
];

// every framework goes through the exact same bundle -> minify pipeline, only
// the compiler in front of it differs
export async function buildFramework(framework: Framework): Promise<string> {
	let built = await build({
		stdin: {
			contents: await framework.input(),
			resolveDir: resolve(import.meta.dirname, "../../"),
			loader: "tsx",
		},
		jsx: framework.jsxImportSource ? "automatic" : undefined,
		jsxImportSource: framework.jsxImportSource,

		platform: "browser",
		format: "esm",
		target: "esnext",

		bundle: true,
		minify: true,
		treeShaking: true,
		write: false,

		// svelte (via esm-env) and solid pick their prod build from this
		conditions: ["production"],
		// anything left checking it at runtime should get the prod branch
		define: { "process.env.NODE_ENV": '"production"' },
	});

	// esbuild leaves behind constants that only terser is able to fold. this
	// used to run on svelte alone, which flattered every other framework
	let minified = await minify(built.outputFiles[0].text, {
		module: true,
		toplevel: true,
		compress: { passes: 3 },
		format: { comments: false },
	});

	return minified.code!;
}

export interface AppBundleSize extends BundleSize {
	name: string;
}

export default async function (): Promise<AppBundleSize[]> {
	return await Promise.all(
		frameworks.map(async (framework) => ({
			name: framework.name,
			...(await computeBundleSize(
				new TextEncoder().encode(await buildFramework(framework))
			)),
		}))
	);
}
