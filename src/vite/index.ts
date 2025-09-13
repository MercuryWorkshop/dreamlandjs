import type { Plugin, PluginOption, UserConfig } from "vite";
import renderToString, { DomSerializerOptions } from "dom-serializer";
import type { RenderedComponent } from "dreamland/ssr/server";

export let jsxPlugin = (): Plugin => ({
	name: "dreamland/vite/jsx",
	config(config: UserConfig) {
		config.esbuild ||= {};
		config.esbuild.jsx = "automatic";
		config.esbuild.jsxImportSource = "dreamland";
	},
});

export let renderSsr = async (
	html: string,
	render: () => RenderedComponent,
	transform?: (html: string) => Promise<string> | string
): Promise<string> => {
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
	transform?: (html: string) => string;
};
let _devSsr = (options: DevSsrPluginOptions): PluginOption => ({
	name: "dreamland/vite/dev-ssr",
	apply: "serve",
	async transformIndexHtml(input, ctx) {
		let server = ctx.server!;
		try {
			let entry = await server.ssrLoadModule(options.entry);
			let html = await renderSsr(
				input,
				() => entry.default(ctx.originalUrl!),
				options.transform
			);

			return html;
		} catch (e) {
			server.ssrFixStacktrace(e);
			throw e;
		}
	},
});
// vite types are broken
export let devSsr: (options: DevSsrPluginOptions) => any = _devSsr;
