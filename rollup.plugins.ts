import MagicString from "magic-string";

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
						// Check for property access: don't replace x.Object
						if (j >= 0 && code[j] === ".") {
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
