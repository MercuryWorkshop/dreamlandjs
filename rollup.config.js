import fs from "node:fs";
import { defineConfig } from "rollup";

import strip from "@rollup/plugin-strip";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import nodeResolve from "@rollup/plugin-node-resolve";
import { visualizer } from "rollup-plugin-visualizer";
import MagicString from "magic-string";

let DEV = false;
let USESTR = true;

const common = (include, output) => {
	let tsconfig = import.meta.dirname + "/tsconfig.json";
	if (fs.existsSync(include + "/tsconfig.json")) {
		tsconfig = include + "/tsconfig.json";
	}

	return [
		nodeResolve(),
		typescript({
			include: include + "/**/*",
			filterRoot: process.cwd(),
			tsconfig,
		}),
		terser({
			parse: {},
			compress: {
				passes: 5,
				unsafe: true,
				unsafe_Function: true,
				unsafe_arrows: true,
				unsafe_comps: true,
				unsafe_math: true,
				unsafe_methods: true,
				unsafe_proto: true,
				unsafe_regexp: true,
				unsafe_symbols: true,
				unsafe_undefined: true,
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
			},
			module: true,
			ie8: false,
			safari10: false,
			ecma: 2022,
		}),
		...(output ? [
			visualizer({
				filename: `dist/${output}.size.html`,
				sourcemap: true,
				gzipSize: true,
				brotliSize: true,
				title: `Dreamland ${output} Size`
			})
		] : [])
	];
};

const cfg = ({
	input: entry,
	output,
	defs,
	plugins,
	visualize,
}) => {
	plugins ||= [];
	defs ??= true;

	let stripLabels = [];
	if (DEV) {
		stripLabels.push("prod");
	} else {
		stripLabels.push("dev");
	}

	if (!USESTR) {
		stripLabels.push("usestr");

		// only needed because of declare global
		plugins.push({
			name: "stripBetweenComment",
			transform(source) {
				const startComment = "USESTR.START";
				const endComment = "USESTR.END";
				const pattern = new RegExp(
					`([\\t ]*\\/\\* ?${startComment} ?\\*\\/)[\\s\\S]*?(\\/\\* ?${endComment} ?\\*\\/[\\t ]*\\n?)`,
					"g"
				);
				const code = source.replace(pattern, "");
				return {
					code,
					map: new MagicString(code).generateMap({ hires: true }),
				};
			},
		});
	}
	plugins.push(strip({
		include: ["**/*.ts"],
		functions: [],
		labels: stripLabels
	}));

	const input = `${entry[0]}/${entry[1] || "index.ts"}`;
	const out = [
		defineConfig({
			input,
			output: [
				{ file: `dist/${output}.js`, sourcemap: true },
			],
			plugins: [common(entry[0], visualize && output), ...plugins],
			external: ["dreamland/core"],
		}),
	];
	if (defs) {
		out.push(
			defineConfig({
				input:
					"dist/types/" +
					input.substring("src/".length).replace(".ts", ".d.ts"),
				output: [{ file: `dist/${output}.d.ts`, format: "es" }],
				plugins: [dts()],
				external: ["dreamland/core"],
			})
		);
	}
	return out;
};

export default (args) => {
	if (args["config-dev"]) DEV = true;
	if (args["config-nousestr"]) USESTR = false;

	return defineConfig([
		...cfg({
			input: ["src/core"],
			output: "core",
			plugins: [
				{
					name: "copyConstDefs",
					writeBundle: async () => {
						await new Promise((r) =>
							fs.copyFile(
								"src/core/consts.d.ts",
								"dist/types/core/consts.d.ts",
								r
							)
						);
					},
				},
			],
			visualize: true,
		}),
		...cfg({ input: ["src/router"], output: "router" }),
		...cfg({ input: ["src/js-runtime"], output: "js-runtime" }),
		...cfg({ input: ["src/jsx-runtime"], output: "jsx-runtime" }),
	]);
};
