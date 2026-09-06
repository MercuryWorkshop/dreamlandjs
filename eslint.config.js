import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import compat from "eslint-plugin-compat";
import esx from "eslint-plugin-es-x";
import domCompat from "./eslint.rules.js";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		ignores: ["**/dist/*"],
	},
	{
		files: ["**/*.{js,ts,tsx}"],
		plugins: { js },
		extends: ["js/recommended"],
		languageOptions: {
			ecmaVersion: 2020,
			sourceType: "module",
			globals: { ...globals.browser, ...globals.node },
		},
	},
	tseslint.configs.recommended,
	// dreamland's support floor is Chrome 88 / Firefox 79 / Safari 14.1 - `:where()`
	// sets the lower bound, WeakRef the rest. it's declared in package.json
	// "browserslist", which compat/compat reads directly; es-x approximates it with
	// an ES2021 cutoff, since Firefox 79 is the oldest target and has all of ES2021
	{
		name: "dreamland/support-floor",
		files: ["src/**/*.{js,ts,tsx}"],
		// these never run in a browser: the vite plugin and the ssr renderer are
		// build/server code, so the floor doesn't apply to them
		ignores: ["src/vite/**", "src/ssr/server/**"],
		extends: [
			compat.configs["flat/recommended"],
			esx.configs["flat/restrict-to-es2021"],
		],
		settings: {
			// flag prototype methods (`x.at()`, `x.findLast()`) by name, without
			// needing to know what x is
			"es-x": { aggressive: true },
		},
		rules: {
			// post-ES2021 features the floor does support - the ES2021 cutoff is a
			// stand-in for the browser versions, so trim it where they disagree
			"es-x/no-class-instance-fields": "off", // Chrome 72 / FF 69 / Safari 14
			"es-x/no-class-static-fields": "off", // Chrome 72 / FF 75 / Safari 14.1

			// the ES2025 iterator helpers share their names with Array methods that
			// have existed forever, which `aggressive` can't tell apart. the cost of
			// switching them off is that a real `set.values().map()` slips through
			...Object.fromEntries(
				[
					"drop",
					"every",
					"filter",
					"find",
					"flatmap",
					"foreach",
					"map",
					"reduce",
					"some",
					"take",
					"toarray",
				].map((m) => [`es-x/no-iterator-prototype-${m}`, "off"])
			),
		},
	},
	// compat/compat matches web apis by name, so it only sees the ones reached
	// through a global (`document.x`, `new X()`). dom-compat asks typescript what
	// the receiver is, which covers `el.moveBefore()` and friends. it needs type
	// information, so it can't run on the plain .js files in src/
	{
		name: "dreamland/support-floor-dom",
		files: ["src/**/*.{ts,tsx}"],
		ignores: ["src/vite/**", "src/ssr/server/**"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: { "dom-compat": domCompat },
		rules: { "dom-compat/no-unsupported": "error" },
	},
	{
		rules: {
			"prefer-const": "off",
			"no-unused-labels": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unused-vars": "off",
			// ???
			"@typescript-eslint/no-empty-object-type": "off",
			"no-sparse-arrays": "off",
		},
	},
]);
