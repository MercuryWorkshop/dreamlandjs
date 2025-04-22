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

const common = () => [
	nodeResolve(),
	typescript(),
	terser({
		parse: {},
		compress: {
			passes: 4,
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
		ecma: 5,
	}),
];

const cfg = (input, output, defs, plugins) => {
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

	const out = [
		defineConfig({
			input,
			output: [{ file: output, sourcemap: true, format: "es" }],
			plugins: [common(), ...plugins],
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
			})
		);
	}
	return out;
};

export default (args) => {
	if (args["config-dev"]) DEV = true;
	if (args["config-nousestr"]) USESTR = false;
	return defineConfig([
		...cfg("src/core/index.ts", "dist/core.js", true, [
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
		]),
	]);
};
