import type { Plugin } from "vite";
import { transform } from "lightningcss";
import MagicString from "magic-string";
import type { FilterPattern } from "vite";
import { createFilter } from "vite";

export type CssMinifierOptions = {
	include?: FilterPattern;
	exclude?: FilterPattern;
};

export let cssMinifier = (options: CssMinifierOptions = {}): Plugin => {
	let filter = createFilter(
		options.include || ["**/*.tsx", "**/*.ts", "**/*.jsx", "**/*.js"],
		options.exclude
	);

	return {
		name: "dreamland/vite/css-minifier",
		transform(code, id) {
			if (!filter(id)) return;
			if (!code.includes("css`") && !/css\s+`/.test(code)) return;

			let s: MagicString | undefined;

			// find css`...` tagged template literals
			// we scan character by character to correctly handle nesting
			for (let i = 0; i < code.length; i++) {
				// skip strings
				if (code[i] === '"' || code[i] === "'") {
					let quote = code[i];
					i++;
					while (i < code.length && code[i] !== quote) {
						if (code[i] === "\\") i++;
						i++;
					}
					continue;
				}

				// skip line comments
				if (code[i] === "/" && code[i + 1] === "/") {
					i = code.indexOf("\n", i);
					if (i === -1) break;
					continue;
				}

				// skip block comments
				if (code[i] === "/" && code[i + 1] === "*") {
					i = code.indexOf("*/", i + 2);
					if (i === -1) break;
					i++;
					continue;
				}

				// look for css` or css ` (TypeScript may insert whitespace)
				if (code[i] === "c" && code[i + 1] === "s" && code[i + 2] === "s") {
					// make sure "css" is not part of a larger identifier
					if (i > 0 && /[a-zA-Z0-9_$]/.test(code[i - 1])) continue;

					// skip optional whitespace between css and backtick
					let backtickStart = i + 3;
					while (
						backtickStart < code.length &&
						(code[backtickStart] === " " ||
							code[backtickStart] === "\t" ||
							code[backtickStart] === "\n" ||
							code[backtickStart] === "\r")
					) {
						backtickStart++;
					}
					if (code[backtickStart] !== "`") continue;

					// parse the template literal, collecting quasis and expression ranges
					let quasis: { start: number; end: number }[] = [];
					let quasiStart = backtickStart + 1; // after opening backtick
					let j = quasiStart;
					let depth = 0;

					while (j < code.length) {
						if (code[j] === "\\" && j + 1 < code.length) {
							j += 2;
							continue;
						}

						if (depth === 0) {
							if (code[j] === "`") {
								// end of template literal
								quasis.push({ start: quasiStart, end: j });
								break;
							}
							if (code[j] === "$" && code[j + 1] === "{") {
								quasis.push({ start: quasiStart, end: j });
								depth = 1;
								j += 2;
								continue;
							}
						} else {
							if (code[j] === "{") {
								depth++;
							} else if (code[j] === "}") {
								depth--;
								if (depth === 0) {
									quasiStart = j + 1;
								}
							} else if (code[j] === "`") {
								// nested template literal inside expression
								j++;
								let nestedDepth = 0;
								while (j < code.length) {
									if (code[j] === "\\" && j + 1 < code.length) {
										j += 2;
										continue;
									}
									if (
										code[j] === "$" &&
										code[j + 1] === "{" &&
										nestedDepth === 0
									) {
										nestedDepth = 1;
										j += 2;
										continue;
									}
									if (code[j] === "{" && nestedDepth > 0) {
										nestedDepth++;
										j++;
										continue;
									}
									if (code[j] === "}" && nestedDepth > 0) {
										nestedDepth--;
										j++;
										continue;
									}
									if (code[j] === "`" && nestedDepth === 0) {
										break;
									}
									j++;
								}
							} else if (code[j] === '"' || code[j] === "'") {
								let q = code[j];
								j++;
								while (j < code.length && code[j] !== q) {
									if (code[j] === "\\") j++;
									j++;
								}
							}
						}
						j++;
					}

					if (quasis.length === 0) continue;

					// build a combined CSS string with placeholders for expressions
					// use an identifier placeholder that lightningcss won't strip (unlike comments)
					let PLACEHOLDER = "__DLEXPR__";
					let combined = quasis
						.map((q) => code.slice(q.start, q.end))
						.join(PLACEHOLDER);

					// minify with lightningcss
					try {
						let result = transform({
							filename: id,
							code: Buffer.from(combined),
							minify: true,
						});
						let minified = result.code.toString();

						// split back on placeholders
						let parts = minified.split(PLACEHOLDER);
						if (parts.length !== quasis.length) {
							// lightningcss removed or merged a placeholder;
							// skip this literal to avoid corruption
							let line = code.slice(0, backtickStart).split("\n").length;
							this.warn(
								`css\` literal could not be minified: placeholder count mismatch (expected ${quasis.length}, got ${parts.length})`,
								{ line, column: 0 }
							);
							i = j;
							continue;
						}

						// check if anything actually changed
						let changed = false;
						for (let k = 0; k < quasis.length; k++) {
							if (parts[k] !== code.slice(quasis[k].start, quasis[k].end)) {
								changed = true;
								break;
							}
						}
						if (!changed) {
							i = j;
							continue;
						}

						if (!s) s = new MagicString(code);

						for (let k = 0; k < quasis.length; k++) {
							let orig = code.slice(quasis[k].start, quasis[k].end);
							if (parts[k] !== orig) {
								s.overwrite(quasis[k].start, quasis[k].end, parts[k]);
							}
						}
					} catch (e) {
						let line = code.slice(0, backtickStart).split("\n").length;
						this.warn(
							`css\` literal could not be minified: ${e instanceof Error ? e.message : e}`,
							{ line, column: 0 }
						);
					}

					i = j;
				}
			}

			if (!s) return;
			return {
				code: s.toString(),
				map: s.generateMap({ hires: true }),
			};
		},
	};
};
