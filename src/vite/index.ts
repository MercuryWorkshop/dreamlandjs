import type { Plugin, UserConfig } from "vite";

export let jsxPlugin = (): Plugin => ({
	name: "dreamland/vite",
	config(config: UserConfig) {
		config.esbuild ||= {};
		config.esbuild.jsx = "automatic";
		config.esbuild.jsxImportSource = "dreamland";
	},
});
