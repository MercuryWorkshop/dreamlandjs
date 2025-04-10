import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { defineConfig } from "rollup";
import { dts } from "rollup-plugin-dts";

export default defineConfig([
	{
		input: "src/core/index.ts",
		output: [
			{
				file: "dist/core.js",
				name: "window",
				format: "iife",
				extend: true,
			}
		],
		plugins: [
			typescript(),
			terser({
				parse: {},
				compress: {},
				mangle: {
					keep_classnames: false,
					keep_fnames: false,
					properties: {
						regex: /^_.*/,
					}
				},
				format: {},
				toplevel: true,
				ie8: false,
				safari10: false,
			})
		],
	},
]);
