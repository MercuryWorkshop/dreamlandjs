import fs from "node:fs";
import type { RollupOptions, WarningHandlerWithDefault } from "rollup";

import strip from "@rollup/plugin-strip";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import nodeResolve from "@rollup/plugin-node-resolve";
import { visualizer } from "rollup-plugin-visualizer";
import {
	classToDecl,
	propertyHoister,
	stripBetweenComments,
} from "./rollup.plugins.ts";

let DEV = false;
let USESTR = true;

const onwarn: WarningHandlerWithDefault = (warning, warn) => {
	if (warning.code === "CIRCULAR_DEPENDENCY") return;
	warn(warning);
};

interface CommonConfig {
	typeRoot: string;
	visualizerPath?: string;
	runTerser: boolean;
	unsafe: boolean;
}

function common({ typeRoot, visualizerPath, runTerser, unsafe }: CommonConfig) {
	let tsconfig = import.meta.dirname + "/tsconfig.json";
	if (fs.existsSync(typeRoot + "/tsconfig.json")) {
		tsconfig = typeRoot + "/tsconfig.json";
	}

	return [
		nodeResolve(),
		typescript({
			include: typeRoot + "/**/*",
			filterRoot: process.cwd(),
			tsconfig,
		}),
		...(DEV || !runTerser
			? []
			: [
					terser({
						parse: {},
						compress: {
							passes: 5,
							unsafe: unsafe,
							unsafe_Function: unsafe,
							unsafe_arrows: unsafe,
							unsafe_comps: unsafe,
							unsafe_math: unsafe,
							unsafe_methods: unsafe,
							unsafe_proto: unsafe,
							unsafe_regexp: unsafe,
							unsafe_symbols: unsafe,
							unsafe_undefined: unsafe,
						},
						mangle: {
							keep_classnames: false,
							keep_fnames: false,
							properties: {
								regex: /^_.*/,
							},
						},
						format: {
							wrap_func_args: false,
							comments: /^@/,
						},
						module: true,
						ie8: false,
						safari10: false,
						ecma: 2020,
					}),
				]),
		...(visualizerPath
			? [
					visualizer({
						filename: `dist/${visualizerPath}.size.html`,
						sourcemap: true,
						gzipSize: true,
						brotliSize: true,
						title: `Dreamland ${visualizerPath} Size`,
					}),
				]
			: []),
	];
}

interface CfgOptions {
	input: [string, string?];
	output: string;
	defs?: boolean;
	plugins?: any[];
	visualize?: boolean;
	minify?: boolean;
	unsafeTerser?: boolean;
	hoistProperties?: boolean;
}

const cfg = ({
	input: entry,
	output,
	defs,
	plugins,
	visualize,
	minify,
	unsafeTerser: unsafe,
	hoistProperties,
}: CfgOptions): RollupOptions[] => {
	plugins ||= [];
	defs ??= true;
	minify ??= true;
	unsafe ??= true;
	hoistProperties ??= false;

	let stripLabels = [DEV ? "prod" : "dev"];

	if (!USESTR) {
		stripLabels.push("usestr");

		// only needed because of declare global
		plugins.push(stripBetweenComments("USESTR.START", "USESTR.END"));
	}
	plugins.push(
		strip({
			include: ["**/*.ts", "**/*.tsx"],
			functions: [],
			labels: stripLabels,
		})
	);

	const input = `${entry[0]}/${entry[1] || "index.ts"}`;
	const out: RollupOptions[] = [
		{
			input,
			output: [{ file: `dist/${output}.js`, sourcemap: true }],
			plugins: [
				...(hoistProperties ? [propertyHoister()] : []),
				common({
					runTerser: minify,
					typeRoot: entry[0],
					visualizerPath: visualize ? output : undefined,
					unsafe,
				}),
				...plugins,
			],
			external: ["dreamland/core", "dreamland/ssr/server"],
			onwarn,
		},
	];
	if (defs) {
		out.push({
			input:
				"dist/types/" +
				input
					.substring("src/".length)
					.replace(".tsx", ".ts")
					.replace(".ts", ".d.ts"),
			output: [{ file: `dist/${output}.d.ts`, format: "es" }],
			plugins: [dts()],
			external: ["dreamland/core", "dreamland/ssr/server"],
			onwarn,
		});
	}
	return out;
};

export default (args: Record<string, boolean>) => {
	if (args["config-dev"]) DEV = true;
	if (args["config-nousestr"]) USESTR = false;

	return [
		...cfg({
			input: ["src/core"],
			output: "core",
			hoistProperties: true,
			plugins: [
				{
					name: "copyConstDefs",
					writeBundle: () =>
						fs.promises.copyFile(
							"src/core/consts.d.ts",
							"dist/types/core/consts.d.ts"
						),
				},
				classToDecl(),
			],
			visualize: true,
		}),
		...cfg({ input: ["src/js-runtime"], output: "js-runtime" }),
		...cfg({ input: ["src/jsx-runtime"], output: "jsx-runtime" }),
		...cfg({
			input: ["src/ssr", "server/index.ts"],
			output: "ssr.server",
			plugins: [
				{
					name: "cssom-monkeypatch",
					resolveId(source: string) {
						if (source === "rrweb-cssom") {
							return source;
						}
						return null;
					},
					load(source: string) {
						if (source === "rrweb-cssom") {
							let code = fs.readFileSync(
								"node_modules/rrweb-cssom/build/CSSOM.js"
							);
							return `
								let exports = {};
								${code}
								export { CSSOM };
							`;
						}
						return null;
					},
				},
			],
			minify: false,
			unsafeTerser: false,
		}),
		...cfg({
			input: ["src/ssr", "client/index.ts"],
			output: "ssr.client",
			hoistProperties: true,
			visualize: true,
		}),
		...cfg({
			input: ["src/ssr", "hybrid/index.ts"],
			output: "ssr.hybrid",
			visualize: true,
		}),
		...cfg({ input: ["src/router", "index.tsx"], output: "router" }),
		...cfg({ input: ["src/motion"], output: "motion" }),
		...cfg({ input: ["src/vite"], output: "vite" }),
	] satisfies RollupOptions[];
};
