import path from "node:path";

import MagicString from "magic-string";
import type { SourceMap } from "magic-string";
import type { Plugin, PluginOption, UserConfig } from "vite";
import renderToString, { DomSerializerOptions } from "dom-serializer";
import * as ts from "typescript";
import type { RenderedComponent } from "dreamland/ssr/server";

import {
	DREAMLAND_CSS_EVENT,
	type DreamlandCssUpdate,
} from "./hmrPayload";

export let jsxPlugin = (): Plugin => {
	let command: "build" | "serve" = "build";
	let root = "";
	let rootPosix = "";
	let cssCache = new Map<string, CssModuleMeta>();

	return {
		name: "dreamland/vite/jsx",
		enforce: "pre",
		config(config: UserConfig) {
			config.esbuild ||= {};
			config.esbuild.jsx = "automatic";
			config.esbuild.jsxImportSource = "dreamland";
		},
		configResolved(resolved) {
			command = resolved.command;
			root = resolved.root;
			rootPosix = toPosixPath(root);
		},
		transform(code, id) {
			if (command !== "serve" || !isProcessable(id)) return null;

			let analysis = analyzeCssModule(code, {
				id,
				root,
				rootPosix,
				transform: true,
			});

			if (!analysis) {
				let fsPath = resolveFsPath(id, root);
				if (fsPath) cssCache.delete(fsPath);
				return null;
			}

			cssCache.set(analysis.fsPath, analysis.meta);
			return analysis.transform ?? null;
		},
		async handleHotUpdate(ctx) {
			if (command !== "serve" || !isProcessable(ctx.file)) return;

			try {
				let fsPath = toPosixPath(ctx.file);
				let previous = cssCache.get(fsPath);
				let nextAnalysis = analyzeCssModule(await ctx.read(), {
					id: ctx.file,
					root,
					rootPosix,
					transform: false,
				});

				if (!nextAnalysis) {
					cssCache.delete(fsPath);
					return;
				}

				cssCache.set(fsPath, nextAnalysis.meta);

				if (!previous) return;

				let updates = diffCssEntries(previous, nextAnalysis.meta);
				console.log({ previous, nextAnalysis, updates });
				if (!updates || !updates.length) return;

				ctx.server.ws.send({
					type: "custom",
					event: DREAMLAND_CSS_EVENT,
					data: { file: nextAnalysis.meta.publicPath, updates },
				});

				return [];
			} catch (error) {
				let logger = ctx.server.config.logger;
				let message =
					error instanceof Error
						? error.stack || error.message
						: String(error);
				logger.error(
					`[dreamland:vite] CSS HMR failed for ${ctx.file}\n${message}`
				);
				throw error;
			}
		},
	};
};

type AnalyzeCssOptions = {
	id: string;
	root: string;
	rootPosix: string;
	transform: boolean;
};

type CssEntryMeta = {
	key: string;
	component: string;
	css: string;
	start: number;
	end: number;
};

type CssModuleMeta = {
	entries: CssEntryMeta[];
	stripped: string;
	publicPath: string;
};

type AnalyzeResult = {
	fsPath: string;
	meta: CssModuleMeta;
	transform?: { code: string; map: SourceMap | null };
};

let PROCESSABLE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);


let analyzeCssModule = (
	code: string,
	options: AnalyzeCssOptions
): AnalyzeResult | null => {
	let cleanId = stripQuery(options.id);
	if (!cleanId || cleanId.startsWith("\0")) return null;

	let fsPath = resolveFsPath(cleanId, options.root);
	if (!fsPath || fsPath.includes("/node_modules/")) return null;

	let publicPath = ensureLeadingSlash(
		path.posix.relative(options.rootPosix, fsPath)
	);
	let sourceFile = ts.createSourceFile(
		cleanId,
		code,
		ts.ScriptTarget.Latest,
		true,
		getScriptKind(cleanId)
	);
	let cssIdentifiers = collectCssIdentifiers(sourceFile);
	if (!cssIdentifiers.size) return null;

	let entries: CssEntryMeta[] = [];
	let eligible = true;

	let visit = (node: ts.Node) => {
		if (ts.isTaggedTemplateExpression(node) && isCssTag(node.tag, cssIdentifiers)) {
			if (!ts.isNoSubstitutionTemplateLiteral(node.template)) {
				eligible = false;
				return;
			}

			let parent = node.parent;
			let component: string | null = null;

			if (
				ts.isBinaryExpression(parent) &&
				parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
				ts.isPropertyAccessExpression(parent.left) &&
				parent.left.name.getText() === "style"
			) {
				let expr = parent.left.expression;
				if (ts.isIdentifier(expr)) component = expr.text;
			}

			if (!component) {
				eligible = false;
				return;
			}

			let literal = node.template;
			let raw = (literal as any).rawText ?? literal.text;
			let start = literal.getStart(sourceFile);
			let end = literal.getEnd();
			let key = `${component}:${start}`;

			entries.push({
				key,
				component,
				css: raw,
				start,
				end,
			});
		}

		ts.forEachChild(node, visit);
	};

	ts.forEachChild(sourceFile, visit);

	if (!eligible || !entries.length) return null;

	let strippedBuilder = new MagicString(code);
	entries.forEach((entry, index) => {
		strippedBuilder.overwrite(
			entry.start,
			entry.end,
			`__dreamland_css_${index}__`
		);
	});

	let stripped = strippedBuilder.toString();

	let transform: AnalyzeResult["transform"];
	if (options.transform) {
		transform = createTransformResult(code, publicPath);
	}

	return {
		fsPath,
		meta: {
			entries,
			stripped,
			publicPath,
		},
		transform,
	};
};

let createTransformResult = (
	code: string,
	publicPath: string
): AnalyzeResult["transform"] => {
	let handlerName = "__dreamlandCssApply";
	if (code.includes(handlerName)) return undefined;

	let snippet = `if (import.meta.hot) {\n\tlet ${handlerName};\n\timport.meta.hot.on(${JSON.stringify(
		DREAMLAND_CSS_EVENT
	)}, async ({ file, updates }) => {\n\t\t(${handlerName} ||= (await import("dreamland/vite/client")).applyDreamlandCssUpdates)(updates);\n\t});\n}\n`;

	let ms = new MagicString(code);
	ms.append(`\n${snippet}`);

	return {
		code: ms.toString(),
		map: ms.generateMap({ hires: true }) as SourceMap,
	};
};

let diffCssEntries = (
	previous: CssModuleMeta,
	next: CssModuleMeta
): DreamlandCssUpdate[] | null => {
	if (
		previous.publicPath !== next.publicPath ||
		previous.entries.length !== next.entries.length ||
		previous.stripped !== next.stripped
	)
		return null;

	let prevMap = new Map(previous.entries.map((entry) => [entry.key, entry]));
	let updates: DreamlandCssUpdate[] = [];

	for (let entry of next.entries) {
		let prior = prevMap.get(entry.key);
		if (!prior) return null;

		if (prior.css !== entry.css) {
			updates.push({ component: entry.component, css: entry.css });
		}

		prevMap.delete(entry.key);
	}

	if (prevMap.size) return null;

	return updates;
};

let getScriptKind = (id: string): ts.ScriptKind => {
	switch (path.extname(id)) {
		case ".tsx":
			return ts.ScriptKind.TSX;
		case ".ts":
			return ts.ScriptKind.TS;
		case ".jsx":
			return ts.ScriptKind.JSX;
		case ".js":
			return ts.ScriptKind.JS;
		default:
			return ts.ScriptKind.TSX;
	}
};

let isCssTag = (
	tag: ts.Expression,
	cssIdentifiers: Set<string>
): tag is ts.Identifier => ts.isIdentifier(tag) && cssIdentifiers.has(tag.text);

let collectCssIdentifiers = (source: ts.SourceFile) => {
	let names = new Set<string>();

	for (let statement of source.statements) {
		if (!ts.isImportDeclaration(statement)) continue;
		if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

		let mod = statement.moduleSpecifier.text;
		if (mod !== "dreamland/core" && mod !== "dreamland") continue;

		let clause = statement.importClause;
		if (!clause?.namedBindings) continue;
		if (!ts.isNamedImports(clause.namedBindings)) continue;

		for (let element of clause.namedBindings.elements) {
			let imported = element.propertyName?.text ?? element.name.text;
			if (imported === "css") {
				names.add(element.name.text);
			}
		}
	}

	return names;
};

let isProcessable = (id: string): boolean => {
	let clean = stripQuery(id);
	if (!clean || clean.startsWith("\0")) return false;
	return PROCESSABLE_EXTS.has(path.extname(clean));
};

let stripQuery = (id: string): string => {
	let idx = id.indexOf("?");
	return idx === -1 ? id : id.slice(0, idx);
};

let toPosixPath = (file: string): string => file.replace(/\\/g, "/");

let ensureLeadingSlash = (value: string): string =>
	value.startsWith("/") ? value : `/${value}`;

let resolveFsPath = (id: string, root: string): string | null => {
	let clean = stripQuery(id);
	if (!clean) return null;

	let absolute: string;
	if (clean.startsWith("/@fs/")) {
		absolute = clean.slice("/@fs/".length);
	} else if (path.isAbsolute(clean)) {
		absolute = clean;
	} else if (clean.startsWith("/")) {
		absolute = path.join(root, clean.slice(1));
	} else {
		absolute = path.resolve(root || process.cwd(), clean);
	}

	return toPosixPath(absolute);
};

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
