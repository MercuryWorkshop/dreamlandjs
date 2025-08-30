import type { Plugin, PluginOption, UserConfig } from "vite";
import renderToString from "dom-serializer";

import { promises as fs } from "node:fs";
import { resolve } from "node:path";

export let jsxPlugin = (): Plugin => ({
	name: "dreamland/vite/jsx",
	config(config: UserConfig) {
		config.esbuild ||= {};
		config.esbuild.jsx = "automatic";
		config.esbuild.jsxImportSource = "dreamland";
	},
});

export type DevSsrPluginOptions = {
	entry: string;
	index?: string;
};
let _devSsr = (options: DevSsrPluginOptions): PluginOption => ({
	name: "dreamland/vite/dev-ssr",
	configureServer(server) {
		server.middlewares.use(async (req, res, next) => {
			if (req.url.includes(".")) {
				return next();
			}
			if (req.headers.accept && !req.headers.accept.includes("text/html")) {
				return next();
			}

			try {
				let template = await fs.readFile(
					resolve(server.config.root, options.index || "index.html"),
					"utf-8"
				);
				let html = await server.transformIndexHtml(req.url, template);

				let { render } = await server.ssrLoadModule("dreamland/ssr/server");
				let entry = await server.ssrLoadModule(options.entry);

				let dom = render(entry.default);
				let head = renderToString(dom.head);
				let body = renderToString([dom.state, dom.component]);

				let app = html
					.replace(`<!--ssr-head-->`, head)
					.replace(`<!--ssr-body-->`, body);

				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html");
				res.end(app);
			} catch (e) {
				server.ssrFixStacktrace(e);
				next(e);
			}
		});
	},
});
// vite types are broken
export let devSsr: (options: DevSsrPluginOptions) => any = _devSsr;
