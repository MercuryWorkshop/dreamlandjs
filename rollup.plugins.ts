import fs from "node:fs";
import nodePath from "node:path";
import MagicString from "magic-string";
import ts from "typescript";

export const propertyHoister = () => {
	return {
		name: "property-hoister",
		renderChunk: {
			order: "pre" as const,
			handler(code: string) {
				const propertyUsage = new Map<string, number>();
				let match;

				// Count property accesses
				const patterns = [
					/(?<!\.)\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g, // .property
					/\?\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g, // ?.property
					/\["([^"]+)"\]/g, // ["property"]
					/}([a-zA-Z_$][a-zA-Z0-9_$]*)\(/g, // }method(
					/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/g, // method() {
				];

				const keywords = [
					"if",
					"for",
					"while",
					"switch",
					"catch",
					"function",
					"return",
					"get",
					"set",
				];

				for (const regex of patterns) {
					regex.lastIndex = 0;
					while ((match = regex.exec(code)) !== null) {
						const propName = match[1];
						if (
							propName.length <= 3 ||
							propName.startsWith("_") ||
							keywords.includes(propName)
						)
							continue;
						propertyUsage.set(propName, (propertyUsage.get(propName) || 0) + 1);
					}
				}

				// Calculate which properties to hoist
				const toHoist: Array<[string, string]> = [];
				const minifiedVarLen = 2;

				for (const [propName] of propertyUsage) {
					const varName = `__autofolded_${propName}`;
					const escaped = RegExp.escape(propName);

					const dotCount = (
						code.match(new RegExp(`(?<!\\?|\\.)\\.${escaped}\\b`, "g")) || []
					).length;
					const optionalCount = (
						code.match(new RegExp(`\\?\\.${escaped}\\b`, "g")) || []
					).length;
					const bracketCount = (
						code.match(new RegExp(`\\["${escaped}"\\]`, "g")) || []
					).length;
					const objectKeyCount = (
						code.match(new RegExp(`([,{]\\s*)${escaped}(\\s*:)`, "g")) || []
					).length;
					const methodMinCount = (
						code.match(new RegExp(`}${escaped}\\(`, "g")) || []
					).length;
					const methodUnminCount = (
						code.match(
							new RegExp(`\\b${escaped}\\s*\\([^)]*\\)\\s*\\{`, "g")
						) || []
					).length;

					const declarationCost = minifiedVarLen + propName.length + 4; // var="prop",
					const savings =
						dotCount * (propName.length - minifiedVarLen - 1) +
						optionalCount * (propName.length - minifiedVarLen - 2) +
						bracketCount * propName.length +
						objectKeyCount * (propName.length - minifiedVarLen - 2) +
						methodMinCount * (propName.length - minifiedVarLen - 2) +
						methodUnminCount * (propName.length - minifiedVarLen - 2) -
						declarationCost;

					if (savings > 0) toHoist.push([propName, varName]);
				}

				if (toHoist.length === 0) return null;

				// Collect all transformations
				const replacements: Array<[number, number, string]> = [];
				const declarations = toHoist.map(
					([prop, varName]) => `${varName}="${prop}"`
				);

				for (const [propName, varName] of toHoist) {
					const patterns: Array<[string, string]> = [
						[`?.${propName}`, `?.[${varName}]`],
						[`.${propName}`, `[${varName}]`],
						[`["${propName}"]`, `[${varName}]`],
						[`}${propName}(`, `}[${varName}](`],
					];

					for (const [find, replace] of patterns) {
						let idx = 0;
						while ((idx = code.indexOf(find, idx)) !== -1) {
							// Validate context for .property to avoid ...spread
							if (
								find.startsWith(".") &&
								!find.startsWith("?.") &&
								idx > 0 &&
								code[idx - 1] === "."
							) {
								idx++;
								continue;
							}
							// Validate word boundary
							if (find.includes(propName)) {
								const endIdx = idx + find.length;
								if (
									endIdx < code.length &&
									/[a-zA-Z0-9_$]/.test(code[endIdx])
								) {
									idx++;
									continue;
								}
							}
							replacements.push([idx, idx + find.length, replace]);
							idx += find.length;
						}
					}

					// Handle object keys: { foo: x } and ,foo: x -> {[__foo]:x}
					const objectKeyRegex = new RegExp(
						`([,{]\\s*)${RegExp.escape(propName)}(\\s*:)`,
						"g"
					);
					let objectKeyMatch;
					while ((objectKeyMatch = objectKeyRegex.exec(code)) !== null) {
						const [full, prefix, suffix] = objectKeyMatch;
						const start = objectKeyMatch.index;
						const end = start + full.length;
						replacements.push([start, end, `${prefix}[${varName}]${suffix}`]);
					}

					// Handle unminified methods: methodName(...) {
					let idx = 0;
					while ((idx = code.indexOf(propName, idx)) !== -1) {
						if (idx > 0 && /[a-zA-Z0-9_$]/.test(code[idx - 1])) {
							idx++;
							continue;
						}
						let pos = idx + propName.length;
						while (pos < code.length && /\s/.test(code[pos])) pos++;
						if (code[pos] !== "(") {
							idx++;
							continue;
						}
						let depth = 1,
							close = pos + 1;
						while (close < code.length && depth > 0) {
							if (code[close] === "(") depth++;
							else if (code[close] === ")") depth--;
							close++;
						}
						while (close < code.length && /\s/.test(code[close])) close++;
						if (code[close] === "{") {
							replacements.push([idx, idx + propName.length, `[${varName}]`]);
							idx += propName.length;
							continue;
						}
						idx++;
					}
				}

				// Sort and deduplicate replacements (reverse order for application)
				replacements.sort((a, b) => b[0] - a[0]);
				const seen = new Set<string>();
				const uniqueReplacements = replacements.filter(([start, end]) => {
					const key = `${start}-${end}`;
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				});

				// Apply transformations with MagicString
				const s = new MagicString(code);
				for (const [start, end, replace] of uniqueReplacements) {
					s.overwrite(start, end, replace);
				}

				let lastImportIndex = 0;
				for (let i = 0; i < code.length; i++) {
					if (/\s/.test(code[i])) continue;
					if (code.startsWith("//", i)) {
						const idx = code.indexOf("\n", i);
						i = idx === -1 ? code.length : idx;
						continue;
					}
					if (code.startsWith("/*", i)) {
						const idx = code.indexOf("*/", i);
						i = idx === -1 ? code.length : idx + 1;
						continue;
					}
					if (code.startsWith("import", i)) {
						const next = code[i + 6];
						if (!next || !/[a-zA-Z0-9_$]/.test(next)) {
							let inQuote: string | null = null;
							let depth = 0;
							for (let j = i; j < code.length; j++) {
								const ch = code[j];
								if (inQuote) {
									if (ch === "\\" && code[j + 1]) j++;
									else if (ch === inQuote) inQuote = null;
								} else {
									if (ch === "'" || ch === '"') inQuote = ch;
									else if (ch === "{" || ch === "(") depth++;
									else if (ch === "}" || ch === ")") depth--;
									else if (ch === ";" && depth === 0) {
										lastImportIndex = j + 1;
										i = j;
										break;
									}
								}
							}
							continue;
						}
					}
					break;
				}

				s.appendRight(lastImportIndex, `let ${declarations.join(",")};`);

				return {
					code: s.toString(),
					map: s.generateMap({ hires: true }),
				};
			},
		},
	};
};

export const stringHoister = () => {
	return {
		name: "string-hoister",
		renderChunk: {
			order: "pre" as const,
			handler(code: string) {
				// Detect existing property hoister declarations to reuse their variables.
				// The property hoister inserts: let __autofolded_foo="foo",__autofolded_bar="bar";
				const existingVars = new Map<string, string>(); // "value" -> varName
				const propHoistMatch = code.match(
					/let (__autofolded_[a-zA-Z_$][a-zA-Z0-9_$]*="[^"]*"(?:,__autofolded_[a-zA-Z_$][a-zA-Z0-9_$]*="[^"]*")*);/
				);
				if (propHoistMatch) {
					const declStr = propHoistMatch[0].slice(4, -1); // strip "let " and ";"
					const declRegex =
						/(__autofolded_[a-zA-Z_$][a-zA-Z0-9_$]*)="([^"]*)"/g;
					let m;
					while ((m = declRegex.exec(declStr)) !== null) {
						// Map both quote styles to the same variable
						existingVars.set(`"${m[2]}"`, m[1]);
						existingVars.set(`'${m[2]}'`, m[1]);
					}
				}

				// Find all string literal positions and values
				const stringOccurrences = new Map<string, Array<[number, number]>>();

				for (let i = 0; i < code.length; i++) {
					const ch = code[i];

					// Skip line comments
					if (ch === "/" && code[i + 1] === "/") {
						const end = code.indexOf("\n", i);
						i = end === -1 ? code.length : end;
						continue;
					}

					// Skip block comments
					if (ch === "/" && code[i + 1] === "*") {
						const end = code.indexOf("*/", i + 2);
						i = end === -1 ? code.length : end + 1;
						continue;
					}

					// Skip template literals
					if (ch === "`") {
						i++;
						let depth = 0;
						while (i < code.length) {
							if (code[i] === "\\" && i + 1 < code.length) {
								i += 2;
								continue;
							}
							if (code[i] === "$" && code[i + 1] === "{" && depth === 0) {
								depth++;
								i += 2;
								continue;
							}
							if (code[i] === "{" && depth > 0) {
								depth++;
								i++;
								continue;
							}
							if (code[i] === "}" && depth > 0) {
								depth--;
								i++;
								continue;
							}
							if (code[i] === "`" && depth === 0) break;
							i++;
						}
						continue;
					}

					if (ch !== '"' && ch !== "'") continue;

					const quote = ch;
					const start = i;
					i++;
					let value = "";
					let valid = true;

					while (i < code.length && code[i] !== quote) {
						if (code[i] === "\\") {
							if (i + 1 < code.length) {
								value += code[i] + code[i + 1];
								i += 2;
							} else {
								valid = false;
								break;
							}
						} else if (code[i] === "\n") {
							valid = false;
							break;
						} else {
							value += code[i];
							i++;
						}
					}

					if (!valid || i >= code.length) continue;

					const end = i + 1; // include closing quote

					// Skip very short strings (hoisting won't save bytes)
					if (value.length < 2) continue;

					// Skip import/export paths
					let skipAsImport = false;
					let j = start - 1;
					while (j >= 0 && /\s/.test(code[j])) j--;
					if (j >= 3 && code.substring(j - 3, j + 1) === "from") {
						skipAsImport = true;
					}
					if (j >= 5 && code.substring(j - 5, j + 1) === "import") {
						skipAsImport = true;
					}
					if (j >= 0 && code[j] === "(") {
						let k = j - 1;
						while (k >= 0 && /\s/.test(code[k])) k--;
						if (k >= 5 && code.substring(k - 5, k + 1) === "import") {
							skipAsImport = true;
						}
					}
					if (skipAsImport) continue;

					// Skip strings that are part of the property hoister's own declarations
					if (
						propHoistMatch &&
						start >= code.indexOf(propHoistMatch[0]) &&
						end <= code.indexOf(propHoistMatch[0]) + propHoistMatch[0].length
					) {
						continue;
					}

					const key = quote + value + quote;
					if (!stringOccurrences.has(key)) {
						stringOccurrences.set(key, []);
					}
					stringOccurrences.get(key)!.push([start, end]);
				}

				// Calculate which strings to hoist
				const toHoist: Array<{
					literal: string;
					varName: string;
					positions: Array<[number, number]>;
					needsDeclaration: boolean;
				}> = [];
				const minifiedVarLen = 2;

				let hoistIdx = 0;
				for (const [literal, positions] of stringOccurrences) {
					const count = positions.length;
					const litLen = literal.length;

					// Check if there's an existing property hoister variable for this string
					const existingVar = existingVars.get(literal);

					if (existingVar) {
						// No declaration cost - the variable already exists
						// Savings: each occurrence saves (litLen - minifiedVarLen)
						const savings = count * (litLen - minifiedVarLen);
						if (savings > 0) {
							toHoist.push({
								literal,
								varName: existingVar,
								positions,
								needsDeclaration: false,
							});
						}
					} else if (count >= 2) {
						// Need our own declaration
						const declarationCost = minifiedVarLen + litLen + 2;
						const savings =
							count * litLen - (declarationCost + count * minifiedVarLen);

						if (savings > 0) {
							toHoist.push({
								literal,
								varName: `__hoisted_str_${hoistIdx++}`,
								positions,
								needsDeclaration: true,
							});
						}
					}
				}

				if (toHoist.length === 0) return null;

				// Build replacements sorted in reverse order
				const replacements: Array<[number, number, string]> = [];
				for (const { varName, positions } of toHoist) {
					for (const [start, end] of positions) {
						replacements.push([start, end, varName]);
					}
				}
				replacements.sort((a, b) => b[0] - a[0]);

				// Deduplicate overlapping replacements
				const seen = new Set<string>();
				const uniqueReplacements = replacements.filter(([start, end]) => {
					const key = `${start}-${end}`;
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				});

				// Apply with MagicString
				const s = new MagicString(code);
				for (const [start, end, replace] of uniqueReplacements) {
					// If this string is an object property key (next non-whitespace is ':',
					// and not a ternary or case statement), wrap in [] for computed property syntax
					let nextChar = end;
					while (nextChar < code.length && /\s/.test(code[nextChar]))
						nextChar++;
					let isObjectKey = false;
					if (nextChar < code.length && code[nextChar] === ":") {
						// Check it's not a ternary — look backward for preceding context
						let prevChar = start - 1;
						while (prevChar >= 0 && /\s/.test(code[prevChar])) prevChar--;
						// Object key if preceded by '{', ',', or '(' (destructuring/object literal)
						if (
							prevChar >= 0 &&
							(code[prevChar] === "{" ||
								code[prevChar] === "," ||
								code[prevChar] === "(")
						) {
							isObjectKey = true;
						}
					}
					if (isObjectKey) {
						s.overwrite(start, end, `[${replace}]`);
					} else {
						s.overwrite(start, end, replace);
					}
				}

				// Only add declarations for strings that need them
				const newDeclarations = toHoist
					.filter((h) => h.needsDeclaration)
					.map(({ literal, varName }) => `${varName}=${literal}`);

				if (newDeclarations.length > 0) {
					// Find insertion point after imports
					let lastImportIndex = 0;
					for (let i = 0; i < code.length; i++) {
						if (/\s/.test(code[i])) continue;
						if (code.startsWith("//", i)) {
							const idx = code.indexOf("\n", i);
							i = idx === -1 ? code.length : idx;
							continue;
						}
						if (code.startsWith("/*", i)) {
							const idx = code.indexOf("*/", i);
							i = idx === -1 ? code.length : idx + 1;
							continue;
						}
						if (code.startsWith("import", i)) {
							const next = code[i + 6];
							if (!next || !/[a-zA-Z0-9_$]/.test(next)) {
								let inQuote: string | null = null;
								let depth = 0;
								for (let j = i; j < code.length; j++) {
									const ch = code[j];
									if (inQuote) {
										if (ch === "\\" && code[j + 1]) j++;
										else if (ch === inQuote) inQuote = null;
									} else {
										if (ch === "'" || ch === '"') inQuote = ch;
										else if (ch === "{" || ch === "(") depth++;
										else if (ch === "}" || ch === ")") depth--;
										else if (ch === ";" && depth === 0) {
											lastImportIndex = j + 1;
											i = j;
											break;
										}
									}
								}
								continue;
							}
						}
						break;
					}

					s.appendRight(lastImportIndex, `let ${newDeclarations.join(",")};`);
				}

				return {
					code: s.toString(),
					map: s.generateMap({ hires: true }),
				};
			},
		},
	};
};

export const globalHoister = (patterns: string[]) => {
	// Sort so compound accesses (e.g. Object.assign) come before their simple
	// base identifiers (e.g. Object). This ensures the compound form gets
	// priority during replacement and is not partially matched by the simple one.
	const sortedPatterns = [...patterns].sort((a, b) => {
		const aDot = a.includes(".");
		const bDot = b.includes(".");
		if (aDot && !bDot) return -1;
		if (!aDot && bDot) return 1;
		// Among same type, longer patterns first
		return b.length - a.length;
	});

	return {
		name: "global-hoister",
		renderChunk: {
			order: "pre" as const,
			handler(code: string) {
				const idChar = /[a-zA-Z0-9_$]/;
				const minifiedVarLen = 2;

				// For each global, find all replaceable positions
				const toHoist: Array<{
					pattern: string;
					varName: string;
					positions: Array<[number, number]>;
				}> = [];

				// Build a set of ranges that are inside strings, comments, or template literals
				// to avoid replacing inside them
				const skipRanges: Array<[number, number]> = [];
				const canStartRegex = (index: number): boolean => {
					let j = index - 1;
					while (j >= 0 && /\s/.test(code[j])) j--;
					if (j < 0) return true;

					const prev = code[j];
					if (prev === ")" || prev === "]" || prev === "}") return false;

					if (idChar.test(prev)) {
						let k = j;
						while (k >= 0 && idChar.test(code[k])) k--;
						const prevWord = code.slice(k + 1, j + 1);
						if (
							[
								"return",
								"throw",
								"case",
								"delete",
								"void",
								"typeof",
								"instanceof",
								"in",
								"of",
								"new",
								"yield",
								"await",
							].includes(prevWord)
						) {
							return true;
						}
						return false;
					}

					return true;
				};

				for (let i = 0; i < code.length; i++) {
					const ch = code[i];
					if (ch === "/" && code[i + 1] === "/") {
						const start = i;
						const end = code.indexOf("\n", i);
						i = end === -1 ? code.length - 1 : end;
						skipRanges.push([start, i + 1]);
						continue;
					}
					if (ch === "/" && code[i + 1] === "*") {
						const start = i;
						const end = code.indexOf("*/", i + 2);
						i = end === -1 ? code.length - 1 : end + 1;
						skipRanges.push([start, i + 1]);
						continue;
					}
					if (ch === "/" && canStartRegex(i)) {
						const start = i;
						i++;
						let inCharClass = false;
						while (i < code.length) {
							if (code[i] === "\\" && i + 1 < code.length) {
								i += 2;
								continue;
							}
							if (code[i] === "[" && !inCharClass) {
								inCharClass = true;
								i++;
								continue;
							}
							if (code[i] === "]" && inCharClass) {
								inCharClass = false;
								i++;
								continue;
							}
							if (code[i] === "/" && !inCharClass) {
								i++;
								while (i < code.length && /[a-z]/i.test(code[i])) i++;
								break;
							}
							i++;
						}
						skipRanges.push([start, i]);
						i--;
						continue;
					}
					if (ch === '"' || ch === "'") {
						const start = i;
						const quote = ch;
						i++;
						while (i < code.length && code[i] !== quote) {
							if (code[i] === "\\") i++;
							i++;
						}
						skipRanges.push([start, i + 1]);
						continue;
					}
					if (ch === "`") {
						const start = i;
						i++;
						let depth = 0;
						while (i < code.length) {
							if (code[i] === "\\" && i + 1 < code.length) {
								i += 2;
								continue;
							}
							if (code[i] === "$" && code[i + 1] === "{" && depth === 0) {
								depth++;
								i += 2;
								continue;
							}
							if (code[i] === "{" && depth > 0) {
								depth++;
								i++;
								continue;
							}
							if (code[i] === "}" && depth > 0) {
								depth--;
								i++;
								continue;
							}
							if (code[i] === "`" && depth === 0) break;
							i++;
						}
						skipRanges.push([start, i + 1]);
						continue;
					}
				}

				const inSkipRange = (pos: number, end: number): boolean => {
					for (const [s, e] of skipRanges) {
						if (pos >= s && end <= e) return true;
						if (s > end) break;
					}
					return false;
				};

				// Track which positions are already claimed by compound patterns
				const claimed = new Set<string>();

				let globalIdx = 0;
				for (const pattern of sortedPatterns) {
					const varName = `__hoisted_global_${globalIdx++}`;
					const positions: Array<[number, number]> = [];
					let idx = 0;
					while ((idx = code.indexOf(pattern, idx)) !== -1) {
						const end = idx + pattern.length;

						// Check word boundaries
						if (idx > 0 && idChar.test(code[idx - 1])) {
							idx++;
							continue;
						}
						// For simple identifiers, check after; for compound (X.Y), the char after should not be an id char
						if (end < code.length && idChar.test(code[end])) {
							idx++;
							continue;
						}

						// Skip if inside string/comment
						if (inSkipRange(idx, end)) {
							idx++;
							continue;
						}

						// Skip if already claimed by a compound pattern
						const key = `${idx}-${end}`;
						let overlapsClaimed = false;
						for (let p = idx; p < end; p++) {
							if (claimed.has(String(p))) {
								overlapsClaimed = true;
								break;
							}
						}
						if (overlapsClaimed) {
							idx++;
							continue;
						}

						// Skip if it looks like a declaration (let/const/var/class/function before it)
						let j = idx - 1;
						while (j >= 0 && /\s/.test(code[j])) j--;
						// Check for property access: don't replace x.Object. a spread
						// ends in a dot too, and `...Array` is a plain reference --
						// only bail on a dot that isn't the tail of a `...`
						if (
							j >= 0 &&
							code[j] === "." &&
							code.slice(j - 2, j + 1) !== "..."
						) {
							idx++;
							continue;
						}

						positions.push([idx, end]);
						idx = end;
					}

					if (positions.length > 0) {
						// Calculate savings
						const patternLen = pattern.length;
						const count = positions.length;
						// Declaration cost: varName=pattern, (before minification the var name is long,
						// but terser will shorten it. After minification: minifiedVarLen=pattern,)
						const declarationCost = minifiedVarLen + patternLen + 2;
						const savings =
							count * patternLen - (declarationCost + count * minifiedVarLen);

						if (savings > 0) {
							toHoist.push({ pattern, varName, positions });
							// Claim these positions
							for (const [start, end] of positions) {
								for (let p = start; p < end; p++) {
									claimed.add(String(p));
								}
							}
						}
					}
				}

				if (toHoist.length === 0) return null;

				// Build a map from base identifier -> varName for reuse in compound declarations
				const baseVarMap = new Map<string, string>();
				for (const { pattern, varName } of toHoist) {
					if (!pattern.includes(".")) {
						baseVarMap.set(pattern, varName);
					}
				}

				// Build replacements in reverse order
				const replacements: Array<[number, number, string]> = [];
				for (const { varName, positions } of toHoist) {
					for (const [start, end] of positions) {
						replacements.push([start, end, varName]);
					}
				}
				replacements.sort((a, b) => b[0] - a[0]);

				const s = new MagicString(code);
				for (const [start, end, replace] of replacements) {
					s.overwrite(start, end, replace);
				}

				// Find insertion point after imports
				let lastImportIndex = 0;
				for (let i = 0; i < code.length; i++) {
					if (/\s/.test(code[i])) continue;
					if (code.startsWith("//", i)) {
						const idx = code.indexOf("\n", i);
						i = idx === -1 ? code.length : idx;
						continue;
					}
					if (code.startsWith("/*", i)) {
						const idx = code.indexOf("*/", i);
						i = idx === -1 ? code.length : idx + 1;
						continue;
					}
					if (code.startsWith("import", i)) {
						const next = code[i + 6];
						if (!next || !/[a-zA-Z0-9_$]/.test(next)) {
							let inQuote: string | null = null;
							let depth = 0;
							for (let j = i; j < code.length; j++) {
								const ch = code[j];
								if (inQuote) {
									if (ch === "\\" && code[j + 1]) j++;
									else if (ch === inQuote) inQuote = null;
								} else {
									if (ch === "'" || ch === '"') inQuote = ch;
									else if (ch === "{" || ch === "(") depth++;
									else if (ch === "}" || ch === ")") depth--;
									else if (ch === ";" && depth === 0) {
										lastImportIndex = j + 1;
										i = j;
										break;
									}
								}
							}
							continue;
						}
					}
					break;
				}

				// Generate declarations with simple identifiers first, so compound
				// patterns can reference them (e.g. `b=Symbol,a=b.toPrimitive`
				// instead of `a=Symbol.toPrimitive,b=Symbol`).
				const simpleDecls: string[] = [];
				const compoundDecls: string[] = [];
				for (const { pattern, varName } of toHoist) {
					if (pattern.includes(".")) {
						const dotIdx = pattern.indexOf(".");
						const base = pattern.substring(0, dotIdx);
						const rest = pattern.substring(dotIdx);
						const baseVar = baseVarMap.get(base);
						// If the base is also hoisted, reference its variable
						compoundDecls.push(
							`${varName}=${baseVar ? baseVar + rest : pattern}`
						);
					} else {
						simpleDecls.push(`${varName}=${pattern}`);
					}
				}
				const declarations = [...simpleDecls, ...compoundDecls];
				s.appendRight(lastImportIndex, `let ${declarations.join(",")};`);

				return {
					code: s.toString(),
					map: s.generateMap({ hires: true }),
				};
			},
		},
	};
};

export const classToDecl = () => ({
	name: "classToDecl",
	transform(source: string) {
		let code = new MagicString(source);
		code.replace(/class ([a-zA-Z]*) *{/g, "let $1 = class {");
		return {
			code: code.toString(),
			map: code.generateMap({ hires: true }),
		};
	},
});

// Combine repeated `x instanceof Class` checks into one dedicated helper per
// class: `let _io0 = (a) => a instanceof Class`. Each helper keeps a *constant*
// right-hand operand, so V8 sees a monomorphic `instanceof` site and can inline
// it — unlike a single generic `(a, b) => a instanceof b` helper, whose RHS
// varies per call site and goes megamorphic. Only hoisted when (a) the class
// name is never bound in a nested scope (so every occurrence provably resolves
// to the same top-level/global binding) and (b) a raw-size cost model says the
// chunk shrinks. The size threshold (>=3 uses) also keeps terser from
// re-inlining the helper, since terser only inlines single-use functions.
const FUNCTION_NODE_TYPES = new Set([
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
]);
export const instanceofHoister = () => ({
	name: "hoist-instanceof-invocation",
	renderChunk: {
		order: "pre" as const,
		handler(code: string) {
			if (!code.includes("instanceof")) return null;

			const ast = this.parse(code);

			// names bound anywhere below the top level — `instanceof X` on such a
			// name might resolve to a shadowing local, so it isn't safe to merge.
			const nestedNames = new Set<string>();
			// every `a instanceof Identifier`, grouped by the identifier text.
			const groups = new Map<string, any[]>();

			const recordPattern = (pat: any, depth: number) => {
				if (!pat) return;
				switch (pat.type) {
					case "Identifier":
						if (depth > 0) nestedNames.add(pat.name);
						break;
					case "ArrayPattern":
						pat.elements.forEach((e: any) => recordPattern(e, depth));
						break;
					case "ObjectPattern":
						pat.properties.forEach((p: any) =>
							recordPattern(p.type === "Property" ? p.value : p, depth)
						);
						break;
					case "AssignmentPattern":
						recordPattern(pat.left, depth);
						break;
					case "RestElement":
						recordPattern(pat.argument, depth);
						break;
				}
			};

			const walk = (node: any, depth: number) => {
				if (!node || typeof node !== "object") return;
				const type = node.type;

				if (type === "VariableDeclarator") recordPattern(node.id, depth);
				else if (
					(type === "FunctionDeclaration" ||
						type === "ClassDeclaration" ||
						type === "FunctionExpression" ||
						type === "ClassExpression") &&
					node.id &&
					depth > 0
				)
					nestedNames.add(node.id.name);
				else if (type === "CatchClause") recordPattern(node.param, depth);

				if (
					type === "BinaryExpression" &&
					node.operator === "instanceof" &&
					node.right?.type === "Identifier" &&
					typeof node.start === "number" &&
					typeof node.left?.start === "number" &&
					typeof node.left?.end === "number"
				) {
					const name = node.right.name;
					(groups.get(name) ?? groups.set(name, []).get(name)!).push(node);
				}

				const inner = FUNCTION_NODE_TYPES.has(type) ? depth + 1 : depth;
				if (FUNCTION_NODE_TYPES.has(type))
					(node.params || []).forEach((p: any) => recordPattern(p, inner));
				for (const key in node) {
					if (key === "params") continue;
					const value = node[key];
					if (Array.isArray(value)) {
						for (const child of value) walk(child, inner);
					} else if (value && typeof value === "object") {
						walk(value, inner);
					}
				}
			};
			walk(ast, 0);

			// cost model, in post-terser bytes (identifiers shrink to ~2 chars).
			const MIN_VAR = 2;
			const INSTANCEOF_LEN = " instanceof ".length;
			// `EXPR instanceof Cls` (EXPR + INSTANCEOF_LEN + clsLen) becomes
			// `H(EXPR)` (helper + parens + EXPR); EXPR cancels out.
			const savePerUse = INSTANCEOF_LEN + MIN_VAR - (MIN_VAR + "()".length);
			// `H=(a)=>a instanceof Cls,`
			const declCost =
				MIN_VAR + "=a=>a".length + INSTANCEOF_LEN + MIN_VAR + ",".length;

			const replacements: Array<[number, number, string]> = [];
			const decls: string[] = [];
			let helperIdx = 0;
			for (const [name, nodes] of groups) {
				if (nestedNames.has(name)) continue;
				if (nodes.length * savePerUse - declCost <= 0) continue;

				const helper = `__io${helperIdx++}`;
				decls.push(`${helper}=(__iov)=>__iov instanceof ${name}`);
				for (const node of nodes) {
					const left = code.slice(node.left.start, node.left.end);
					replacements.push([node.start, node.end, `${helper}(${left})`]);
				}
			}

			if (replacements.length === 0) return null;

			// drop any overlapping (nested) instanceof rewrite — keep the earliest.
			replacements.sort((a, b) => a[0] - b[0]);
			const safe: Array<[number, number, string]> = [];
			let lastEnd = -1;
			for (const r of replacements) {
				if (r[0] < lastEnd) continue;
				safe.push(r);
				lastEnd = r[1];
			}

			const rewritten = new MagicString(code);
			for (const [start, end, replacement] of safe.sort((a, b) => b[0] - a[0]))
				rewritten.overwrite(start, end, replacement);

			let lastImportIndex = 0;
			for (let i = 0; i < code.length; i++) {
				if (/\s/.test(code[i])) continue;
				if (code.startsWith("//", i)) {
					const idx = code.indexOf("\n", i);
					i = idx === -1 ? code.length : idx;
					continue;
				}
				if (code.startsWith("/*", i)) {
					const idx = code.indexOf("*/", i);
					i = idx === -1 ? code.length : idx + 1;
					continue;
				}
				if (code.startsWith("import", i)) {
					const next = code[i + 6];
					if (!next || !/[a-zA-Z0-9_$]/.test(next)) {
						let inQuote: string | null = null;
						let depth = 0;
						for (let j = i; j < code.length; j++) {
							const ch = code[j];
							if (inQuote) {
								if (ch === "\\" && code[j + 1]) j++;
								else if (ch === inQuote) inQuote = null;
							} else {
								if (ch === "'" || ch === '"') inQuote = ch;
								else if (ch === "{" || ch === "(") depth++;
								else if (ch === "}" || ch === ")") depth--;
								else if (ch === ";" && depth === 0) {
									lastImportIndex = j + 1;
									i = j;
									break;
								}
							}
						}
						continue;
					}
				}
				break;
			}
			rewritten.appendRight(lastImportIndex, `let ${decls.join(",")};`);

			return {
				code: rewritten.toString(),
				map: rewritten.generateMap({ hires: true }),
			};
		},
	},
});

export const typeofHoister = () => ({
	name: "hoist-typeof-invocation",
	renderChunk: {
		order: "pre" as const,
		handler(code: string) {
			if (!code.includes("typeof")) return null;

			const ast = this.parse(code);
			const rewritten = new MagicString(code);
			const replacements: Array<[number, number, string]> = [];

			const visit = (node: any) => {
				if (!node || typeof node !== "object") return;
				if (
					node.type === "BinaryExpression" &&
					["==", "===", "!=", "!=="].includes(node.operator) &&
					typeof node.start === "number" &&
					typeof node.end === "number" &&
					typeof node.left?.start === "number" &&
					typeof node.left?.end === "number" &&
					typeof node.right?.start === "number" &&
					typeof node.right?.end === "number"
				) {
					const leftIsTypeof =
						node.left.type === "UnaryExpression" &&
						node.left.operator === "typeof" &&
						typeof node.left.argument?.start === "number" &&
						typeof node.left.argument?.end === "number";
					const rightIsTypeof =
						node.right.type === "UnaryExpression" &&
						node.right.operator === "typeof" &&
						typeof node.right.argument?.start === "number" &&
						typeof node.right.argument?.end === "number";

					if (leftIsTypeof || rightIsTypeof) {
						const isNegated = node.operator === "!=" || node.operator === "!==";
						const typeofArg = leftIsTypeof
							? code.slice(node.left.argument.start, node.left.argument.end)
							: code.slice(node.right.argument.start, node.right.argument.end);
						const compareArg = leftIsTypeof
							? code.slice(node.right.start, node.right.end)
							: code.slice(node.left.start, node.left.end);
						const helperCall = `__typeof(${typeofArg}, ${compareArg})`;
						replacements.push([
							node.start,
							node.end,
							isNegated ? `!${helperCall}` : helperCall,
						]);
					}
				}

				for (const value of Object.values(node)) {
					if (!value) continue;
					if (Array.isArray(value)) {
						for (const child of value) {
							if (child && typeof child === "object") visit(child);
						}
					} else if (typeof value === "object") {
						visit(value);
					}
				}
			};

			visit(ast);
			if (replacements.length === 0) return null;

			replacements.sort((a, b) => b[0] - a[0]);
			for (const [start, end, replacement] of replacements) {
				rewritten.overwrite(start, end, replacement);
			}

			const helperDecl = "let __typeof = (x, a) => typeof x == a;";
			if (!code.includes(helperDecl)) {
				let lastImportIndex = 0;
				for (let i = 0; i < code.length; i++) {
					if (/\s/.test(code[i])) continue;
					if (code.startsWith("//", i)) {
						const idx = code.indexOf("\n", i);
						i = idx === -1 ? code.length : idx;
						continue;
					}
					if (code.startsWith("/*", i)) {
						const idx = code.indexOf("*/", i);
						i = idx === -1 ? code.length : idx + 1;
						continue;
					}
					if (code.startsWith("import", i)) {
						const next = code[i + 6];
						if (!next || !/[a-zA-Z0-9_$]/.test(next)) {
							let inQuote: string | null = null;
							let depth = 0;
							for (let j = i; j < code.length; j++) {
								const ch = code[j];
								if (inQuote) {
									if (ch === "\\" && code[j + 1]) j++;
									else if (ch === inQuote) inQuote = null;
								} else {
									if (ch === "'" || ch === '"') inQuote = ch;
									else if (ch === "{" || ch === "(") depth++;
									else if (ch === "}" || ch === ")") depth--;
									else if (ch === ";" && depth === 0) {
										lastImportIndex = j + 1;
										i = j;
										break;
									}
								}
							}
							continue;
						}
					}
					break;
				}
				rewritten.appendRight(lastImportIndex, helperDecl);
			}

			return {
				code: rewritten.toString(),
				map: rewritten.generateMap({ hires: true }),
			};
		},
	},
});

// every name a parameter or declarator pattern binds
const patternNames = (pat: any, out: string[] = []): string[] => {
	if (!pat) return out;
	switch (pat.type) {
		case "Identifier":
			out.push(pat.name);
			break;
		case "ObjectPattern":
			pat.properties.forEach((p: any) =>
				patternNames(p.type === "Property" ? p.value : p.argument, out)
			);
			break;
		case "ArrayPattern":
			pat.elements.forEach((e: any) => patternNames(e, out));
			break;
		case "AssignmentPattern":
			patternNames(pat.left, out);
			break;
		case "RestElement":
			patternNames(pat.argument, out);
			break;
	}
	return out;
};

const eachChild = (node: any, fn: (child: any) => void) => {
	for (const key in node) {
		if (key === "type" || key === "start" || key === "end") continue;
		const value = node[key];
		if (Array.isArray(value)) {
			for (const child of value)
				if (child && typeof child.type === "string") fn(child);
		} else if (value && typeof value.type === "string") fn(value);
	}
};

// `false` from the visitor prunes that subtree
const walkAst = (
	node: any,
	visit: (node: any, parent: any) => any,
	parent: any = null
) => {
	if (!node) return;
	if (visit(node, parent) === false) return;
	eachChild(node, (child) => walkAst(child, visit, node));
};

// the names a statement list binds in its own scope. `var` is left out on
// purpose: it hoists out of the list it is written in, so it belongs to the
// enclosing function instead
const lexicalNames = (stmts: any[]): string[] =>
	stmts.flatMap((stmt) =>
		stmt.type === "VariableDeclaration" && stmt.kind !== "var"
			? stmt.declarations.flatMap((d: any) => patternNames(d.id))
			: (stmt.type === "FunctionDeclaration" ||
						stmt.type === "ClassDeclaration") &&
				  stmt.id
				? [stmt.id.name]
				: []
	);

// every `var` below `node`, all of which hoist to the nearest enclosing function
const varNames = (node: any, out: string[] = []): string[] => {
	walkAst(node, (n) => {
		if (FUNCTION_NODE_TYPES.has(n.type)) return false;
		if (n.type === "VariableDeclaration" && n.kind === "var")
			n.declarations.forEach((d: any) => patternNames(d.id, out));
	});
	return out;
};

// every identifier an expression reads *freely*. a name the expression itself
// binds -- a nested function's parameter, a `let` in a nested block, a catch
// param -- can only ever resolve inside the expression, so moving the
// expression cannot change what it means and it is not a read. non-computed
// property names, labels and `new.target` are not reads either.
//
// the scope tracking is what keeps an unrelated name collision from reading as
// a capture: a nested arrow's own `at` is not the body's `at`.
const identsRead = (node: any): Set<string> => {
	const names = new Set<string>();

	const visitBlock = (stmts: any[], scopes: Set<string>[]) => {
		const inner = [...scopes, new Set(lexicalNames(stmts))];
		for (const stmt of stmts) visit(stmt, inner);
	};

	// a binding pattern reads only its defaults and computed keys -- the names it
	// binds are collected by whichever node introduced the scope
	const visitPattern = (pat: any, scopes: Set<string>[]) => {
		if (!pat) return;
		switch (pat.type) {
			case "Identifier":
				break;
			case "ObjectPattern":
				for (const prop of pat.properties)
					if (prop.type === "Property") {
						if (prop.computed) visit(prop.key, scopes);
						visitPattern(prop.value, scopes);
					} else visitPattern(prop.argument, scopes);
				break;
			case "ArrayPattern":
				pat.elements.forEach((e: any) => visitPattern(e, scopes));
				break;
			case "AssignmentPattern":
				visitPattern(pat.left, scopes);
				visit(pat.right, scopes);
				break;
			case "RestElement":
				visitPattern(pat.argument, scopes);
				break;
			// a target that is not an identifier -- `[a.b] = x` -- reads `a`
			default:
				visit(pat, scopes);
		}
	};

	const visit = (n: any, scopes: Set<string>[]) => {
		if (!n || typeof n.type !== "string") return;
		switch (n.type) {
			case "Identifier":
				if (!scopes.some((s) => s.has(n.name))) names.add(n.name);
				return;

			case "MemberExpression":
				visit(n.object, scopes);
				if (n.computed) visit(n.property, scopes);
				return;

			case "Property":
			case "PropertyDefinition":
			case "MethodDefinition":
				if (n.computed) visit(n.key, scopes);
				visit(n.value, scopes);
				return;

			case "MetaProperty":
			case "BreakStatement":
			case "ContinueStatement":
				return;

			case "LabeledStatement":
				visit(n.body, scopes);
				return;

			case "FunctionDeclaration":
			case "FunctionExpression":
			case "ArrowFunctionExpression": {
				const scope = new Set<string>();
				// a function expression's own name is in scope inside it
				if (n.id) scope.add(n.id.name);
				for (const param of n.params)
					patternNames(param).forEach((x) => scope.add(x));
				const inner = [...scopes, scope];
				// defaults and computed keys in the parameter list read from the
				// function's own scope
				for (const param of n.params) visitPattern(param, inner);
				if (n.body.type === "BlockStatement") {
					varNames(n.body).forEach((x) => scope.add(x));
					visitBlock(n.body.body, inner);
				} else visit(n.body, inner);
				return;
			}

			case "ClassDeclaration":
			case "ClassExpression": {
				const inner = n.id ? [...scopes, new Set([n.id.name])] : scopes;
				visit(n.superClass, inner);
				visit(n.body, inner);
				return;
			}

			case "BlockStatement":
			case "StaticBlock":
				visitBlock(n.body, scopes);
				return;

			case "ForStatement": {
				const inner =
					n.init?.type === "VariableDeclaration" && n.init.kind !== "var"
						? [...scopes, new Set(lexicalNames([n.init]))]
						: scopes;
				visit(n.init, inner);
				visit(n.test, inner);
				visit(n.update, inner);
				visit(n.body, inner);
				return;
			}

			case "ForInStatement":
			case "ForOfStatement": {
				const inner =
					n.left.type === "VariableDeclaration" && n.left.kind !== "var"
						? [...scopes, new Set(lexicalNames([n.left]))]
						: scopes;
				visit(n.left, inner);
				visit(n.right, inner);
				visit(n.body, inner);
				return;
			}

			case "CatchClause": {
				const inner = [...scopes, new Set(patternNames(n.param))];
				visitPattern(n.param, inner);
				visitBlock(n.body.body, inner);
				return;
			}

			// every case shares one block scope, so the declarations of all of them
			// have to be collected before any case body is walked
			case "SwitchStatement": {
				visit(n.discriminant, scopes);
				const inner = [
					...scopes,
					new Set(lexicalNames(n.cases.flatMap((c: any) => c.consequent))),
				];
				for (const c of n.cases) {
					visit(c.test, inner);
					c.consequent.forEach((s: any) => visit(s, inner));
				}
				return;
			}

			case "VariableDeclarator":
				visitPattern(n.id, scopes);
				visit(n.init, scopes);
				return;

			default:
				eachChild(n, (child) => visit(child, scopes));
		}
	};

	visit(node, []);
	return names;
};

// Folds a function's leading `let` group into default parameters:
//
//     let f = (a, b) => { let x = a.p, y = b.q; return x + y };
//     ->
//     let f = (a, b, x = a.p, y = b.q) => { return x + y };
//
// terser collapses that to `(a,b,x=a.p,y=b.q)=>x+y`, so this pass only performs
// the move -- the block collapse, the renaming and any follow-on shrinking stay
// terser's job. Worth ~5 bytes per declaration group, and it is a transform terser
// neither performs itself nor undoes, so the two compose.
//
// Sound only when every call site passes at most `params.length` arguments, so a
// moved binding always initializes from its default. That is the whole risk:
// `.map(f)` hands the callback an index and `.forEach(f)` an index and the array,
// either of which would land in a slot this pass assumes is empty. So a candidate
// has to prove its call sites, and anything that cannot is left alone.
//
// Runs after rollup has flattened the modules into one scope, which is what makes
// the call sites checkable at all -- a per-module transform hook cannot see them.
export const defaultParamFolder = (internalPrefix = "_") => ({
	name: "default-param-folder",
	renderChunk: {
		order: "pre" as const,
		handler(code: string) {
			const ast = this.parse(code);

			// a top-level name is unique in the flattened chunk unless something
			// below the top level rebinds it, which `shadowed` catches
			const exported = new Set<string>();
			const shadowed = new Set<string>();
			const topLevelFns = new Map<string, any>();
			// identifier -> the parent of each of its references
			const refParents = new Map<string, any[]>();
			// property name -> the call nodes invoking it, and whether it is ever
			// touched outside callee position (which would make it escape)
			const methodCalls = new Map<string, any[]>();
			const methodEscapes = new Set<string>();

			// the declarations a name may be bound by without that counting as
			// shadowing -- everything else below the top level does
			const topLevelDecls = new Set<any>();

			for (const stmt of (ast as any).body) {
				if (stmt.type === "ExportNamedDeclaration") {
					for (const spec of stmt.specifiers || [])
						exported.add(spec.local.name);
					// deliberately not collected into `topLevelFns`: everything an
					// `export` declares is in `exported`, so it could never fold anyway
					for (const decl of stmt.declaration?.declarations || [])
						patternNames(decl.id).forEach((n) => exported.add(n));
					if (stmt.declaration?.type === "VariableDeclaration")
						topLevelDecls.add(stmt.declaration);
				}
				if (stmt.type === "VariableDeclaration") {
					topLevelDecls.add(stmt);
					for (const decl of stmt.declarations)
						if (
							decl.id.type === "Identifier" &&
							decl.init &&
							FUNCTION_NODE_TYPES.has(decl.init.type)
						)
							topLevelFns.set(decl.id.name, decl.init);
				}
			}

			walkAst(ast, (node, parent) => {
				if (FUNCTION_NODE_TYPES.has(node.type))
					for (const param of node.params)
						patternNames(param).forEach((n) => {
							if (topLevelFns.has(n)) shadowed.add(n);
						});
				if (node.type === "VariableDeclarator" && !topLevelDecls.has(parent))
					patternNames(node.id).forEach((n) => {
						if (topLevelFns.has(n)) shadowed.add(n);
					});

				const isPropertyName =
					parent?.type === "MemberExpression" &&
					parent.property === node &&
					!parent.computed;
				if (node.type === "Identifier" && parent && !isPropertyName) {
					if (!refParents.has(node.name)) refParents.set(node.name, []);
					refParents.get(node.name)!.push(parent);
				}

				if (
					node.type === "MemberExpression" &&
					!node.computed &&
					node.property.type === "Identifier"
				) {
					const name = node.property.name;
					if (parent?.type === "CallExpression" && parent.callee === node) {
						if (!methodCalls.has(name)) methodCalls.set(name, []);
						methodCalls.get(name)!.push(parent);
					} else methodEscapes.add(name);
				}
			});

			const argsFit = (call: any, arity: number) =>
				call.arguments.length <= arity &&
				!call.arguments.some((a: any) => a.type === "SpreadElement");

			const candidates: any[] = [];

			// module-scope arrows whose every reference is a direct call. the moment
			// one is used as a value -- handed to .map, stored in an object, exported
			// -- its call sites stop being knowable and it drops out here.
			//
			// `exported` is only the chunk's own exports: a name a source module
			// exported to a sibling is just a local by the time rollup has flattened
			// them, so scoping helpers like rewriteSelector still fold
			for (const [name, fn] of topLevelFns) {
				if (
					fn.type !== "ArrowFunctionExpression" ||
					exported.has(name) ||
					shadowed.has(name)
				)
					continue;
				const refs = refParents.get(name) || [];
				const calls = refs.filter((p) => p.type !== "VariableDeclarator");
				if (
					calls.length &&
					calls.every(
						(parent) =>
							parent.type === "CallExpression" &&
							parent.callee?.name === name &&
							argsFit(parent, fn.params.length)
					)
				)
					candidates.push(fn);
			}

			// methods the project has already marked internal by naming. these are the
			// names terser's property mangler rewrites, so by the project's own
			// contract no caller outside the chunk can even spell them. Object-literal
			// methods are `Property` nodes (`method: true`), whereas class methods are
			// `MethodDefinition` nodes.
			walkAst(ast, (node) => {
				const isClassMethod =
					node.type === "MethodDefinition" && node.kind === "method";
				const isObjectMethod = node.type === "Property" && node.method;
				if (!isClassMethod && !isObjectMethod) return;
				if (node.computed || !node.key.name?.startsWith(internalPrefix)) return;
				if (methodEscapes.has(node.key.name)) return;
				const calls = methodCalls.get(node.key.name) || [];
				if (
					calls.length &&
					calls.every((c) => argsFit(c, node.value.params.length))
				)
					candidates.push(node.value);
			});

			const rewritten = new MagicString(code);
			let folded = 0;

			for (const fn of candidates) {
				if (fn.body.type !== "BlockStatement") continue;
				if (fn.params.some((p: any) => p.type === "RestElement")) continue;
				// Only the leading declaration run moves: anything after a statement
				// cannot move without reordering effects. Keep the declarations as a
				// run so consecutive `let`s (rather than only one `let` group) can be
				// folded together.
				const leadingDecls: any[] = [];
				for (const stmt of fn.body.body) {
					if (stmt.type !== "VariableDeclaration" || stmt.kind === "var") break;
					leadingDecls.push(stmt);
				}
				if (!leadingDecls.length) continue;

				const moved = leadingDecls.flatMap((d) =>
					d.declarations.flatMap((x: any) => patternNames(x.id))
				);
				const paramNames = new Set(
					fn.params.flatMap((p: any) => patternNames(p))
				);
				if (moved.some((n: string) => paramNames.has(n))) continue;

				// a moved initializer evaluates in the parameter scope, which cannot
				// see the body scope. and once the parameter list goes non-simple the
				// two scopes split for real, so a `var` of a moved name stops aliasing.
				// both scans stay deliberately wide: a `var` nested anywhere hoists
				// back out to the body scope, and a nested arrow's `arguments` is this
				// function's
				const rest = fn.body.body.slice(leadingDecls.length);
				let hasVar = false;
				let usesArguments = false;
				for (const stmt of rest)
					walkAst(stmt, (n) => {
						if (n.type === "VariableDeclaration" && n.kind === "var")
							hasVar = true;
						if (n.type === "Identifier" && n.name === "arguments")
							usesArguments = true;
					});
				if (hasVar) continue;
				// arrows have no `arguments`; for anything else the object would go
				// from mapped to unmapped
				if (usesArguments && fn.type !== "ArrowFunctionExpression") continue;

				// only what the body binds at its own top level can capture a name out
				// from under a moved initializer. a `let` inside a nested block was
				// never in scope where the declaration used to sit either, so it is not
				// a conflict -- and the one declaration that would reach out of a block,
				// `var`, is what the scan above already bails on
				const bodyBindings = new Set(lexicalNames(rest));

				let safe = true;
				const declared = new Set<string>();
				for (const decl of leadingDecls) {
					for (const d of decl.declarations) {
						for (const name of d.init ? identsRead(d.init) : [])
							if (
								bodyBindings.has(name) ||
								(moved.includes(name) &&
									!declared.has(name) &&
									!FUNCTION_NODE_TYPES.has(d.init?.type))
							) {
								safe = false;
								break;
							}
						if (!safe) break;
						patternNames(d.id).forEach((n) => declared.add(n));
					}
					if (!safe) break;
				}
				if (!safe) continue;

				// Splice the declarators in as trailing parameters. This always wins:
				// the declaration keywords and semicolons go away, at most a `,` comes
				// back.
				const decls = leadingDecls
					.flatMap((decl) => decl.declarations)
					.map((d: any) => code.slice(d.start, d.end))
					.join(",");
				const lastParam = fn.params[fn.params.length - 1];
				if (lastParam) rewritten.appendLeft(lastParam.end, `,${decls}`);
				else {
					const open = code.indexOf("(", fn.start);
					rewritten.appendLeft(code.indexOf(")", open), decls);
				}
				for (const decl of leadingDecls) rewritten.remove(decl.start, decl.end);
				folded++;
			}

			if (!folded) return null;
			return {
				code: rewritten.toString(),
				map: rewritten.generateMap({ hires: true }),
			};
		},
	},
});

export const stripBetweenComments = (
	startComment: string,
	endComment: string
) => ({
	name: "stripBetweenComments",
	transform(source: string) {
		let code = new MagicString(source);
		const pattern = new RegExp(
			`([\\t ]*\\/\\* ?${startComment} ?\\*\\/)[\\s\\S]*?(\\/\\* ?${endComment} ?\\*\\/[\\t ]*\\n?)`,
			"g"
		);
		code.replace(pattern, "");
		return {
			code: code.toString(),
			map: code.generateMap({ hires: true }),
		};
	},
});

// Size accounting at function/class/method granularity.
//
// rollup-plugin-visualizer buckets rendered bytes per *module*: for every byte
// of output it asks the sourcemap which file that byte came from, and drops the
// line/column it got back. This keeps those coordinates and intersects them
// with a TypeScript AST of the original source, so each byte is charged to the
// innermost function/class/method that contains it.
//
// It works only because the sourcemap chain survives the pipeline -- every
// transform above returns a hires MagicString map and terser chains its own --
// so minified bytes still trace to original .ts positions. A transform that
// dropped its map would collapse its files back into one bucket each.
//
// Reading the output:
//   - terser inlines, so a callee's bytes are charged to the callee once per
//     call site: a symbol's size is what that code costs, not what deleting it
//     would save
//   - bytes inside a file but inside no function (imports, top-level consts)
//     land in "(top level)"
//   - compressed size cannot be split per symbol, so these are raw bytes

const B64 = new Map<string, number>();
"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	.split("")
	.forEach((c, i) => B64.set(c, i));

interface Segment {
	line: number;
	col: number;
	src: number;
	srcLine: number;
	srcCol: number;
}

// A sourcemap lookup per output byte is what makes the visualizer's sourcemap
// mode slow enough that it disables gzip sizing. Decoding the mappings once and
// charging the run of bytes between consecutive segments is the same answer for
// a fraction of the work, since every byte in a run shares one origin.
const decodeMappings = (mappings: string): Segment[] => {
	const out: Segment[] = [];
	let src = 0,
		srcLine = 0,
		srcCol = 0;

	const lines = mappings.split(";");
	for (let line = 0; line < lines.length; line++) {
		let col = 0;
		for (const field of lines[line].split(",")) {
			if (!field) continue;

			let pos = 0;
			const read = () => {
				let value = 0,
					shift = 0,
					digit;
				do {
					digit = B64.get(field[pos++]) ?? 0;
					// 2 ** shift rather than a shift op: a minified line is one
					// long line, so generated columns get big enough that the
					// last group would overflow into the sign bit
					value += (digit & 31) * 2 ** shift;
					shift += 5;
				} while (digit & 32);
				return value & 1 ? -(value >>> 1) : value >>> 1;
			};

			col += read();
			// a one-field segment marks generated code with no origin
			if (pos >= field.length) continue;
			src += read();
			srcLine += read();
			srcCol += read();
			out.push({ line, col, src, srcLine, srcCol });
		}
	}
	return out;
};

interface Sym {
	name: string;
	line: number;
	start: number;
	end: number;
	parent: Sym | null;
	path?: string[];
}

const scriptKind = (file: string) =>
	file.endsWith(".tsx")
		? ts.ScriptKind.TSX
		: file.endsWith(".jsx")
			? ts.ScriptKind.JSX
			: file.endsWith(".js")
				? ts.ScriptKind.JS
				: ts.ScriptKind.TS;

// An arrow or function expression carries no name of its own, so take the one
// it is about to be bound to -- `const f = () => {}` reads as `f`, not `(anon)`.
const inferredName = (node: any, sf: any): string | null => {
	const parent = node.parent;
	if (!parent) return null;
	if (ts.isVariableDeclaration(parent) && parent.initializer === node)
		return parent.name.getText(sf);
	if (ts.isPropertyAssignment(parent) && parent.initializer === node)
		return parent.name.getText(sf);
	if (
		ts.isBinaryExpression(parent) &&
		parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
		parent.right === node
	)
		return parent.left.getText(sf);
	return null;
};

const symbolName = (
	node: any,
	sf: any
): { name: string; anon: boolean } | null => {
	// an overload signature or an ambient declaration emits nothing, and
	// counting it would collide with the implementation it belongs to --
	// three `_jsx` siblings would push an `@line` onto the one real function
	if ("body" in node && !node.body && !ts.isPropertyDeclaration(node))
		return null;
	if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
		const name = node.name?.getText(sf) ?? inferredName(node, sf);
		return name ? { name, anon: false } : { name: "(class)", anon: true };
	}
	if (ts.isConstructorDeclaration(node))
		return { name: "constructor", anon: false };
	if (ts.isGetAccessor(node))
		return { name: `get ${node.name.getText(sf)}`, anon: false };
	if (ts.isSetAccessor(node))
		return { name: `set ${node.name.getText(sf)}`, anon: false };
	if (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node))
		return { name: node.name.getText(sf), anon: false };
	if (
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node)
	) {
		// a class field's initializer is not a symbol of its own, or
		// `x = () => {}` would nest an `x` inside `x`
		const parent = node.parent;
		if (
			parent &&
			ts.isPropertyDeclaration(parent) &&
			parent.initializer === node
		)
			return null;
		const name = node.name?.getText(sf) ?? inferredName(node, sf);
		return name ? { name, anon: false } : { name: "(anon)", anon: true };
	}
	return null;
};

interface Range {
	start: number;
	end: number;
	sym: Sym | null;
}

interface SourceIndex {
	ranges: Range[];
	lineStarts: number[];
}

// Symbol intervals nest exactly (they come from an AST), so one sweep with a
// stack flattens them into disjoint ranges each labelled with the innermost
// symbol covering it. That turns attribution into a binary search per segment.
const flatten = (syms: Sym[]): Range[] => {
	const sorted = syms
		.slice()
		.sort((a, b) => a.start - b.start || b.end - a.end);
	const ranges: Range[] = [];
	const stack: Sym[] = [];
	let cur = 0;

	const close = (until: number) => {
		while (stack.length && stack[stack.length - 1].end <= until) {
			const top = stack.pop()!;
			if (cur < top.end) ranges.push({ start: cur, end: top.end, sym: top });
			cur = Math.max(cur, top.end);
		}
	};

	for (const sym of sorted) {
		close(sym.start);
		if (cur < sym.start)
			ranges.push({
				start: cur,
				end: sym.start,
				sym: stack[stack.length - 1] ?? null,
			});
		cur = Math.max(cur, sym.start);
		stack.push(sym);
	}
	close(Infinity);
	return ranges;
};

const buildIndex = (file: string, text: string): SourceIndex => {
	const sf = ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(file)
	);

	const syms: Sym[] = [];
	// siblings only: two `(anon)`s under different parents already read apart
	const siblings = new Map<Sym | null, Sym[]>();
	const anon = new Set<Sym>();

	const walk = (node: any, parent: Sym | null) => {
		let inner = parent;
		const named = symbolName(node, sf);
		if (named) {
			const start = node.getStart(sf);
			const sym: Sym = {
				name: named.name,
				line: sf.getLineAndCharacterOfPosition(start).line + 1,
				start,
				end: node.getEnd(),
				parent,
			};
			syms.push(sym);
			if (named.anon) anon.add(sym);
			const group = siblings.get(parent);
			if (group) group.push(sym);
			else siblings.set(parent, [sym]);
			inner = sym;
		}
		node.forEachChild((child: any) => walk(child, inner));
	};
	sf.forEachChild((node: any) => walk(node, null));

	// `mapChild.(anon)` says nothing when a function holds four callbacks, and
	// two overloads or two `on` methods in one scope collide the same way
	for (const group of siblings.values()) {
		const seen = new Map<string, number>();
		for (const sym of group) seen.set(sym.name, (seen.get(sym.name) ?? 0) + 1);
		for (const sym of group)
			if (anon.has(sym) || seen.get(sym.name)! > 1) sym.name += `@${sym.line}`;
	}

	const lineStarts = [0];
	for (let i = 0; i < text.length; i++)
		if (text[i] === "\n") lineStarts.push(i + 1);

	return { ranges: flatten(syms), lineStarts };
};

const symPath = (sym: Sym): string[] => {
	if (sym.path) return sym.path;
	const out: string[] = [];
	for (let node: Sym | null = sym; node; node = node.parent)
		out.unshift(node.name);
	return (sym.path = out);
};

const rangeAt = (ranges: Range[], pos: number): Range | null => {
	let lo = 0,
		hi = ranges.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (ranges[mid].end <= pos) lo = mid + 1;
		else if (ranges[mid].start > pos) hi = mid - 1;
		else return ranges[mid];
	}
	return null;
};

const mkNode = (n: string) => ({
	n,
	s: 0,
	t: 0,
	f: false,
	i: new Map<string, any>(),
});

// fileAt marks which segment of the path is the source file, so the treemap can
// hand every symbol in a file one colour instead of one per cell
const addBytes = (root: any, path: string[], bytes: number, fileAt: number) => {
	root.t += bytes;
	let cur = root;
	for (let i = 0; i < path.length; i++) {
		let next = cur.i.get(path[i]);
		if (!next) cur.i.set(path[i], (next = mkNode(path[i])));
		if (i === fileAt) next.f = true;
		next.t += bytes;
		cur = next;
	}
	cur.s += bytes;
};

// `s` is bytes charged to the node itself, `t` includes descendants
const toJson = (node: any, top?: boolean): any => {
	let name = node.n;
	let cur = node;
	let file = node.f;
	// a directory that only ever holds one thing is a level the treemap spends
	// without saying anything -- `src` then `core` then `state` would use up the
	// whole depth budget before reaching a single function
	if (!top)
		while (cur.i.size === 1 && cur.s === 0) {
			const only = [...cur.i.values()][0];
			name += "/" + only.n;
			file ||= only.f;
			cur = only;
		}
	return {
		n: name,
		s: cur.s,
		t: cur.t,
		...(file ? { f: 1 } : {}),
		c: [...cur.i.values()].map((c) => toJson(c)).sort((a, b) => b.t - a.t),
	};
};

// A treemap of the tree above, inlined into one file so it opens off disk. The
// page script is deliberately concatenation-only -- it lives inside a template
// literal, so a backtick or a `${` in it would be read by this file instead.
const symbolTemplate = (title: string, data: any) => `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
:root { color-scheme: dark }
body { margin: 0; height: 100vh; display: flex; flex-direction: column; overflow: hidden;
	background: #111; color: #ddd; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace }
#head { flex: none; display: flex; gap: 10px; align-items: baseline;
	padding: 7px 10px; border-bottom: 1px solid #2c2c2c }
#crumbs { display: flex; gap: 5px; align-items: baseline; flex-wrap: wrap }
#crumbs button { background: none; border: 0; padding: 0; cursor: pointer;
	color: #6cf; font: inherit; text-decoration: underline }
#crumbs button:last-of-type { color: #ddd; text-decoration: none; cursor: default }
.sep { color: #555 }
#total { margin-left: auto; color: #888 }
#hint { color: #555 }
#map { position: relative; flex: 1; margin: 3px }
.cell { position: absolute; box-sizing: border-box; overflow: hidden;
	border: 1px solid rgba(0, 0, 0, .5); border-radius: 2px }
.cell:hover { outline: 1px solid #fff; outline-offset: -1px }
.lbl { padding: 0 3px; font-size: 10px; line-height: 14px; color: #fff; white-space: nowrap;
	overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0, 0, 0, .85) }
#tip { position: fixed; display: none; z-index: 2; pointer-events: none; max-width: 70ch;
	padding: 4px 7px; border: 1px solid #444; border-radius: 3px; background: #000e }
</style>
<div id="head"><span id="crumbs"></span><span id="hint">click to zoom, esc to go up</span><span id="total"></span></div>
<div id="map"></div>
<div id="tip"></div>
<script>
var DATA = ${JSON.stringify(data).replace(/</g, "\\u003c")};
var trail = [DATA], MAXD = 6;
var map = document.getElementById("map"), tip = document.getElementById("tip");

function fmt(b) { return b < 1024 ? b + " B" : (b / 1024).toFixed(1) + " KiB" }
function hue(s) {
	var h = 0;
	for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
	return h % 360;
}
// bytes charged to a node itself become a real child, so that a parent's area
// stays the sum of what is drawn inside it
function kids(n) {
	var c = n.c.slice();
	if (n.s > 0 && c.length) c.push({ n: "(self)", s: n.s, t: n.s, c: [] });
	return c.sort(function (a, b) { return b.t - a.t });
}
function worst(row, sum, side) {
	var mx = -Infinity, mn = Infinity;
	for (var i = 0; i < row.length; i++) {
		if (row[i] > mx) mx = row[i];
		if (row[i] < mn) mn = row[i];
	}
	var s2 = sum * sum, l2 = side * side;
	return Math.max(l2 * mx / s2, s2 / (l2 * mn));
}
function squarify(nodes, x, y, w, h) {
	var out = [], total = 0, i = 0;
	for (var k = 0; k < nodes.length; k++) total += nodes[k].t;
	if (total <= 0 || w <= 0 || h <= 0) return out;
	var scale = w * h / total;
	while (i < nodes.length) {
		var side = Math.min(w, h);
		if (side <= 0) break;
		var row = [], sum = 0, best = Infinity, j = i;
		while (j < nodes.length) {
			var v = Math.max(nodes[j].t * scale, 1e-9);
			row.push(v);
			var r = worst(row, sum + v, side);
			if (row.length > 1 && r > best) { row.pop(); break }
			sum += v; best = r; j++;
		}
		var thick = sum / side, off = 0;
		for (var m = 0; m < row.length; m++) {
			var len = row[m] / sum * side;
			out.push(w >= h
				? { n: nodes[i + m], x: x, y: y + off, w: thick, h: len }
				: { n: nodes[i + m], x: x + off, y: y, w: len, h: thick });
			off += len;
		}
		if (w >= h) { x += thick; w -= thick } else { y += thick; h -= thick }
		i = j;
	}
	return out;
}
// directories and files each take a colour from their own name; symbols inherit
// the colour of the file they live in, so one file reads as one block
function draw(node, x, y, w, h, depth, hu, up, frag) {
	var own = hu === null ? hue(node.n) : hu;
	var el = document.createElement("div");
	el.className = "cell";
	el.style.cssText = "left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h +
		"px;background:hsl(" + own + " 50% " + Math.min(15 + depth * 8, 55) + "%)";
	el._n = node;
	el._up = up;
	frag.appendChild(el);
	var head = w > 44 && h > 15 ? 14 : 0;
	if (head) {
		var lbl = document.createElement("div");
		lbl.className = "lbl";
		lbl.textContent = node.n + "  " + fmt(node.t);
		el.appendChild(lbl);
	}
	var c = kids(node);
	if (depth >= MAXD || !c.length || w - 2 < 12 || h - 2 - head < 12) return;
	var sub = squarify(c, x + 1, y + 1 + head, w - 2, h - 2 - head), below = up.concat(node.n);
	for (var i = 0; i < sub.length; i++)
		draw(sub[i].n, sub[i].x, sub[i].y, sub[i].w, sub[i].h, depth + 1,
			node.f ? own : hu, below, frag);
}
function render() {
	// a root with one child would spend the whole viewport drawing a border
	// around it, so walk down until there is a real split to look at
	while (trail[trail.length - 1].c.length === 1 && !trail[trail.length - 1].s)
		trail.push(trail[trail.length - 1].c[0]);
	var root = trail[trail.length - 1];
	map.textContent = "";
	var frag = document.createDocumentFragment(), up = trail.map(function (n) { return n.n });
	var rects = squarify(kids(root), 0, 0, map.clientWidth, map.clientHeight);
	for (var i = 0; i < rects.length; i++)
		draw(rects[i].n, rects[i].x, rects[i].y, rects[i].w, rects[i].h, 0, null, up, frag);
	map.appendChild(frag);

	var crumbs = document.getElementById("crumbs");
	crumbs.textContent = "";
	trail.forEach(function (node, i) {
		var b = document.createElement("button");
		b.textContent = node.n;
		b.onclick = function () { trail = trail.slice(0, i + 1); render() };
		crumbs.appendChild(b);
		if (i < trail.length - 1) {
			var sep = document.createElement("span");
			sep.className = "sep";
			sep.textContent = "/";
			crumbs.appendChild(sep);
		}
	});
	document.getElementById("total").textContent =
		fmt(root.t) + " of " + fmt(DATA.t) + " (" + (root.t / DATA.t * 100).toFixed(1) + "%)";
}
map.addEventListener("click", function (e) {
	var el = e.target.closest(".cell");
	if (!el || !el._n.c.length) return;
	trail = trail.concat([el._n]);
	render();
});
map.addEventListener("mousemove", function (e) {
	var el = e.target.closest(".cell");
	if (!el) { tip.style.display = "none"; return }
	var n = el._n;
	tip.style.display = "block";
	tip.textContent = el._up.slice(1).concat(n.n).join(" \\u203a ") + " — " + fmt(n.t) +
		" (" + (n.t / DATA.t * 100).toFixed(2) + "%)" +
		(n.c.length && n.s ? ", " + fmt(n.s) + " of it own" : "");
	tip.style.left = Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 6) + "px";
	tip.style.top = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 6) + "px";
});
map.addEventListener("mouseleave", function () { tip.style.display = "none" });
addEventListener("keydown", function (e) {
	if ((e.key === "Escape" || e.key === "Backspace") && trail.length > 1) { trail.pop(); render() }
});
addEventListener("resize", render);
render();
</script>
`;

export const symbolVisualizer = ({
	filename,
	title,
}: {
	filename: string;
	title: string;
}) => ({
	name: "symbol-visualizer",
	async generateBundle(outputOptions: any, bundle: any) {
		const root = mkNode(title);
		const chunks = Object.values<any>(bundle).filter((c) => c.type === "chunk");
		const prefixChunk = chunks.length > 1;
		let sawMap = false;

		for (const chunk of chunks) {
			if (!chunk.map) continue;
			sawMap = true;

			const { code, map } = chunk;
			const outFile =
				outputOptions.file ??
				nodePath.join(outputOptions.dir ?? ".", chunk.fileName);
			const outDir = nodePath.dirname(nodePath.resolve(outFile));
			const prefix = prefixChunk ? [chunk.fileName] : [];

			const lineStarts = [0];
			for (let i = 0; i < code.length; i++)
				if (code[i] === "\n") lineStarts.push(i + 1);

			const points = decodeMappings(map.mappings)
				.map((seg) => ({
					off: Math.min(
						(lineStarts[seg.line] ?? code.length) + seg.col,
						code.length
					),
					seg,
				}))
				.sort((a, b) => a.off - b.off);

			const indexes = new Map<number, SourceIndex | null>();
			const names = new Map<number, string[]>();

			const bytes = (start: number, end: number) =>
				end > start ? Buffer.byteLength(code.slice(start, end)) : 0;

			// output ahead of the first mapping is the banner and terser's own glue
			addBytes(
				root,
				[...prefix, "(unmapped)"],
				bytes(0, points.length ? points[0].off : code.length),
				-1
			);

			for (let i = 0; i < points.length; i++) {
				const { off, seg } = points[i];
				const len = bytes(
					off,
					i + 1 < points.length ? points[i + 1].off : code.length
				);
				if (!len) continue;

				let name = names.get(seg.src);
				if (!name) {
					const source = map.sources[seg.src];
					names.set(
						seg.src,
						(name = source
							? nodePath
									.relative(process.cwd(), nodePath.resolve(outDir, source))
									.split(nodePath.sep)
							: ["(unknown)"])
					);
				}

				let index = indexes.get(seg.src);
				if (index === undefined) {
					const content = map.sourcesContent?.[seg.src];
					indexes.set(
						seg.src,
						(index = content ? buildIndex(map.sources[seg.src], content) : null)
					);
				}
				const fileAt = prefix.length + name.length - 1;
				if (!index) {
					addBytes(root, [...prefix, ...name, "(no source)"], len, fileAt);
					continue;
				}

				const pos = (index.lineStarts[seg.srcLine] ?? 0) + seg.srcCol;
				const sym = rangeAt(index.ranges, pos)?.sym;
				addBytes(
					root,
					[...prefix, ...name, ...(sym ? symPath(sym) : ["(top level)"])],
					len,
					fileAt
				);
			}
		}

		if (!sawMap) {
			this.warn(
				"symbol-visualizer needs output.sourcemap = true to attribute bytes"
			);
			return;
		}

		await fs.promises.mkdir(nodePath.dirname(filename), { recursive: true });
		await fs.promises.writeFile(
			filename,
			symbolTemplate(title, toJson(root, true))
		);
	},
});
