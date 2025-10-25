import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
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
