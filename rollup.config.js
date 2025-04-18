import strip from "@rollup/plugin-strip";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { defineConfig } from "rollup";
import { dts } from "rollup-plugin-dts";
import fs from "node:fs";

let DEV = false;

const common = () => [
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
			}
		},
		format: {
			wrap_func_args: false,
		},
		module: true,
		ie8: false,
		safari10: false,
		ecma: 5,
	})
]

const cfg = (input, output, defs, plugins) => {
	if (DEV) {
		plugins.push(strip({
			include: ["**/*.ts"],
			functions: [],
			labels: ["prod"]
		}));
	} else {
		plugins.push(strip({
			include: ["**/*.ts"],
			functions: [],
			labels: ["dev"]
		}));
	}

	const out = [
		defineConfig({
			input,
			output: [{ file: output, sourcemap: true, format: "es" }],
			plugins: [common(), ...plugins],
		})
	];
	if (defs) {
		out.push(defineConfig({
			input: "dist/types/" + input.substring("src/".length).replace(".ts", ".d.ts"),
			output: [{ file: output.replace(".js", ".d.ts"), format: "es" }],
			plugins: [dts()]
		}));
	}
	return out;
}

export default (args) => {
	if (args.dev) DEV = true;
	return defineConfig([
		...cfg("src/core/index.ts", "dist/core.js", true, [{
			name: "copy",
			buildEnd: async () => {
				await new Promise(r => fs.copyFile("src/core/consts.d.ts", "dist/types/core/consts.d.ts", r));
			}
		}]),
	]);
}
