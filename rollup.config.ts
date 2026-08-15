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
	defaultParamFolder,
	globalHoister,
	instanceofHoister,
	propertyHoister,
	stringHoister,
	stripBetweenComments,
	symbolVisualizer,
	typeofHoister,
} from "./rollup.plugins.ts";

let DEV = false;
let EMITDEFS = true;
let USESTR = true;
let HOISTS = [
	"Object",
	"Object.assign",
	"Symbol",
	"Symbol.toPrimitive",
	"Array",
	"Reflect",
	"globalThis",
	"Map",
	"WeakMap",
	"WeakRef",
	"Promise",
	//	"Promise.all", unsafe transform
	"Proxy",
	"location",
];

const onwarn: WarningHandlerWithDefault = (warning, warn) => {
	if (warning.code === "CIRCULAR_DEPENDENCY") return;
	warn(warning);
};

const outDir = () => (DEV ? "dist/dev" : "dist");
const typesDir = () => outDir() + "/types";

interface CommonConfig {
	typeRoot: string;
	visualizerPath?: string;
	runTerser: boolean;
	unsafe: boolean;
	hoist: boolean;
}

function common({
	typeRoot,
	visualizerPath,
	runTerser,
	unsafe,
	hoist,
}: CommonConfig) {
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
			...(EMITDEFS
				? { declarationDir: typesDir() }
				: {
						declaration: false,
						declarationDir: undefined,
						noCheck: true,
						types: [],
					}),
		}),
		...(hoist
			? [
					defaultParamFolder(),
					globalHoister(HOISTS),
					propertyHoister(),
					stringHoister(),
					instanceofHoister(),
					typeofHoister(),
				]
			: []),
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
						// both are silently ignored under sourcemap: true --
						// the plugin drops them rather than compressing a
						// per-module byte soup
						gzipSize: true,
						brotliSize: true,
						title: `Dreamland ${visualizerPath} Size`,
					}),
					symbolVisualizer({
						filename: `dist/${visualizerPath}.symbols.html`,
						title: `Dreamland ${visualizerPath} Symbols`,
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
	hoist?: boolean;
	unsafeTerser?: boolean;
	external?: string[] | true;
	bundled?: string[];
}

const cfg = ({
	input: entry,
	output,
	defs,
	plugins,
	visualize,
	minify,
	hoist,
	unsafeTerser: unsafe,
	external: extraExternal,
	bundled,
}: CfgOptions): RollupOptions[] => {
	plugins ||= [];
	defs ??= true;
	minify ??= true;
	unsafe ??= true;
	hoist ??= false;

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
	const bundledSet = new Set(bundled);
	const external =
		extraExternal === true
			? (id: string) =>
					id !== input &&
					!id.startsWith(".") &&
					!id.startsWith("/") &&
					!id.startsWith("\0") &&
					!bundledSet.has(id)
			: ["dreamland/core", "dreamland/ssr/server", ...(extraExternal || [])];
	const out: RollupOptions[] = [
		{
			input,
			output: [{ file: `${outDir()}/${output}.js`, sourcemap: true }],
			plugins: [
				...common({
					runTerser: minify,
					typeRoot: entry[0],
					visualizerPath: visualize && !DEV ? output : undefined,
					unsafe,
					hoist,
				}),
				...plugins,
			],
			external,
			onwarn,
		},
	];
	if (defs && EMITDEFS) {
		out.push({
			input:
				typesDir() +
				"/" +
				input
					.substring("src/".length)
					.replace(".tsx", ".ts")
					.replace(".ts", ".d.ts"),
			output: [{ file: `${outDir()}/${output}.d.ts`, format: "es" }],
			plugins: [dts()],
			external,
			onwarn,
		});
	}
	return out;
};

const configs = () => {
	const constDefs = typesDir() + "/core/consts.d.ts";

	return [
		...cfg({
			input: ["src/core"],
			output: "core",
			hoist: true,
			plugins: [
				...(EMITDEFS
					? [
							{
								name: "copyConstDefs",
								writeBundle: () =>
									fs.promises.copyFile("src/core/consts.d.ts", constDefs),
							},
						]
					: []),
				classToDecl(),
			],
			visualize: true,
		}),
		...cfg({ input: ["src/babel-compat"], output: "babel-compat" }),
		...cfg({ input: ["src/js-runtime"], output: "js-runtime" }),
		...cfg({ input: ["src/jsx-runtime"], output: "jsx-runtime" }),
		...cfg({
			input: ["src/ssr", "server/index.ts"],
			output: "ssr.server",
			external: true,
			bundled: ["rrweb-cssom"],
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
			hoist: true,
			visualize: true,
		}),
		...cfg({
			input: ["src/ssr", "hybrid/index.ts"],
			output: "ssr.hybrid",
			visualize: true,
		}),
		...cfg({
			input: ["src/router", "index.tsx"],
			output: "router",
			visualize: true,
			hoist: true,
		}),
		...cfg({ input: ["src/motion"], output: "motion" }),
		...cfg({
			input: ["src/vite"],
			output: "vite",
			external: true,
		}),
		...cfg({ input: ["src/util"], output: "util" }),
	] satisfies RollupOptions[];
};

export default (args: Record<string, boolean>) => {
	if (args["config-nousestr"]) USESTR = false;

	const variants = args["config-dev"] ? [true] : [false, true];
	const out: RollupOptions[] = [];
	for (const dev of variants) {
		DEV = dev;
		EMITDEFS = dev === variants[0];
		out.push(...configs());
	}
	return out;
};
