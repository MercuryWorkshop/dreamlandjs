import fs from "node:fs";
import { defineConfig } from "rollup";

import strip from "@rollup/plugin-strip";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import nodeResolve from "@rollup/plugin-node-resolve";
import MagicString from "magic-string";

let DEV = false;
let USESTR = true;

const common = (include) => {
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
	];
};

const cfg = (
	inputDir,
	inputFile,
	output,
	defs,
	plugins,
	format,
	extraOutput = {}
) => {
	const stripCommon = {
		include: ["**/*.ts"],
		functions: [],
	};
	if (DEV) {
		plugins.push(
			strip({
				...stripCommon,
				labels: ["prod"],
			})
		);
	} else {
		plugins.push(
			strip({
				...stripCommon,
				labels: ["dev"],
			})
		);
	}

	if (!USESTR) {
		plugins.push(
			strip({
				...stripCommon,
				labels: ["usestr"],
			})
		);
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

	const input = inputDir + "/" + inputFile;
	const out = [
		defineConfig({
			input,
			output: [
				Object.assign(
					{ file: output, sourcemap: true, format: format },
					extraOutput
				),
			],
			plugins: [common(inputDir), ...plugins],
			external: format !== "iife" ? ["dreamland/core"] : [],
		}),
	];
	if (defs) {
		out.push(
			defineConfig({
				input:
					"dist/types/" +
					input.substring("src/".length).replace(".ts", ".d.ts"),
				output: [{ file: output.replace(".js", ".d.ts"), format: "es" }],
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
		...cfg(
			"src/core",
			"index.ts",
			"dist/core.js",
			true,
			[
				{
					name: "copy",
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
			"es"
		),
		...cfg("src/router", "index.ts", "dist/router.js", true, [], "es"),
		...cfg("src/js-runtime", "index.ts", "dist/js-runtime.js", false, [], "es"),
		...cfg(
			"src/jsx-runtime",
			"index.ts",
			"dist/jsx-runtime.js",
			true,
			[],
			"es"
		),
	]);
};
