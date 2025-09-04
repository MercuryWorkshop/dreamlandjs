import type { Plugin, PluginOption, UserConfig } from "vite";
import renderToString, { DomSerializerOptions } from "dom-serializer";
import type { RenderedComponent } from "dreamland/ssr/server";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import htm from "htm";

export let jsxPlugin = (): Plugin => ({
	name: "dreamland/vite/jsx",
	config(config: UserConfig) {
		config.esbuild ||= {};
		config.esbuild.jsx = "automatic";
		config.esbuild.jsxImportSource = "dreamland";
	},
});

export let renderSsr = async (
	path: string,
	render: () => RenderedComponent,
	transform?: (html: string) => Promise<string> | string
): Promise<string> => {
	let html = await readFile(path, "utf8");

	if (transform) html = await transform(html);

	let cfg: DomSerializerOptions = {
		encodeEntities: "utf8",
		decodeEntities: false,
	};
	let dom = render();
	let head = renderToString([dom.data, ...dom.head], cfg);
	let body = renderToString(dom.component, cfg);

	return html.replace(`<!--ssr-head-->`, head).replace(`<!--ssr-body-->`, body);
};

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
				let entry = await server.ssrLoadModule(options.entry);
				let html = await renderSsr(
					resolve(server.config.root, options.index || "index.html"),
					() => entry.default(req.url),
					(x) => server.transformIndexHtml(req.url, x)
				);

				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html");
				res.end(html);
			} catch (e) {
				server.ssrFixStacktrace(e);
				next(e);
			}
		});
	},
});
// vite types are broken
export let devSsr: (options: DevSsrPluginOptions) => any = _devSsr;
