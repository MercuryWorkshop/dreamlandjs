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

				s.prepend(`let ${declarations.join(",")};`);

				return {
					code: s.toString(),
					map: s.generateMap({ hires: true }),
				};
			},
		},
	};
};

export const stripBetweenComments = (
	startComment: string,
	endComment: string
) => ({
	name: "stripBetweenComments",
	transform(source: string) {
		const pattern = new RegExp(
			`([\\t ]*\\/\\* ?${startComment} ?\\*\\/)[\\s\\S]*?(\\/\\* ?${endComment} ?\\*\\/[\\t ]*\\n?)`,
			"g"
		);
		const code = source.replace(pattern, "");
		return {
			code,
			map: new MagicString(code).generateMap({ hires: true }),
		};
	},
});
