import bcd from "@mdn/browser-compat-data" with { type: "json" };
import browserslist from "browserslist";

// compat/compat only recognizes web apis by name - it can't tell what `el` in
// `el.moveBefore()` is, so instance members slip past it. this rule asks
// typescript for the interface a member was declared on and looks that up in
// mdn's data, which covers everything reached through a typed value.

// browserslist ids -> browser-compat-data ids
let BCD_IDS = {
	chrome: "chrome",
	edge: "edge",
	firefox: "firefox",
	safari: "safari",
	ios_saf: "safari_ios",
	and_chr: "chrome_android",
	and_ff: "firefox_android",
	op_mob: "opera_android",
	samsung: "samsunginternet_android",
	android: "webview_android",
	opera: "opera",
};

// mdn stores "mirror" instead of a version for browsers that inherit support
// from an upstream engine. real mirroring maps release dates; treating the
// versions as equal is close enough for the engines we target
let MIRRORS = {
	edge: "chrome",
	safari_ios: "safari",
	chrome_android: "chrome",
	firefox_android: "firefox",
	opera: "chrome",
	opera_android: "chrome_android",
	samsunginternet_android: "chrome_android",
	webview_android: "chrome",
};

let compareVersions = (a, b) => {
	let x = String(a).split(".");
	let y = String(b).split(".");
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		let diff = (parseFloat(x[i]) || 0) - (parseFloat(y[i]) || 0);
		if (diff) return diff;
	}
	return 0;
};

// the oldest version of each browser we have to keep working
let resolveTargets = (path) => {
	let targets = new Map();
	for (let target of browserslist(undefined, { path })) {
		let [name, range] = target.split(" ");
		let id = BCD_IDS[name];
		if (!id) continue;
		// ranges like "ios_saf 14.0-14.4": the low end is what has to work
		let version = range.split("-")[0];
		let known = targets.get(id);
		if (!known || compareVersions(version, known) < 0) targets.set(id, version);
	}
	return targets;
};

// a browser can have several support statements; the ones behind a prefix, a
// flag or a different name aren't support we'd rely on
let statements = (support, id, depth = 0) => {
	let entries = [support[id]].flat().filter(Boolean);
	if (entries[0]?.version_added === "mirror" && depth < 4 && MIRRORS[id])
		return statements(support, MIRRORS[id], depth + 1);
	return entries.filter((e) => !e.prefix && !e.flags && !e.alternative_name);
};

// "≤37" means "at or before 37", which is as good as a plain 37 here
let covers = (statement, target) => {
	let added = statement.version_added;
	if (!added) return false;
	if (
		added !== true &&
		compareVersions(target, String(added).replace("≤", "")) < 0
	)
		return false;
	let removed = statement.version_removed;
	return !removed || compareVersions(target, String(removed)) < 0;
};

// browsers in our support floor that predate the feature, and ones that ship it
// with known holes - mdn tracks those as separate, partial statements
let unsupportedIn = (support, targets) => {
	let missing = [];
	let partial = [];
	for (let [id, target] of targets) {
		let applies = statements(support, id).filter((s) => covers(s, target));
		// no data at all for this browser: don't guess
		if (!statements(support, id).length) continue;
		let name = `${bcd.browsers[id]?.name || id} ${target}`;
		if (!applies.length) missing.push(name);
		else if (applies.every((s) => s.partial_implementation)) partial.push(name);
	}
	return { missing, partial };
};

// climb to whatever the member was declared on: `interface Element {}` for
// instance members, `declare var AbortSignal: {}` for statics
let declaringName = (declaration) => {
	for (
		let node = declaration?.parent, i = 0;
		node && i < 4;
		node = node.parent, i++
	)
		if (typeof node.name?.text === "string") return node.name.text;
};

// mdn indexes some members under the concrete interface rather than the mixin
// they're declared on (adoptedStyleSheets is DocumentOrShadowRoot in lib.dom,
// api.Document in mdn), so the receiver's own type is a useful second guess
let typeNames = (type, depth = 0) => {
	let names = [];
	if (depth > 3) return names;
	for (let part of type.isUnionOrIntersection?.() ? type.types : [type]) {
		let name = part.getSymbol?.()?.getName?.();
		if (name) names.push(name);
		if (part.isClassOrInterface?.())
			for (let base of part.getBaseTypes?.() || [])
				names.push(...typeNames(base, depth + 1));
	}
	return names;
};

let libDeclaration = (checker, tsNode) => {
	let declaration = checker.getSymbolAtLocation(tsNode)?.declarations?.[0];
	let file = declaration?.getSourceFile?.().fileName || "";
	// only platform apis: es-x already covers the ecmascript side
	return /[/\\]lib\.dom(\.[a-z]+)*\.d\.ts$/.test(file)
		? declaration
		: undefined;
};

let rule = {
	meta: {
		type: "problem",
		docs: {
			description: "disallow web apis newer than the browserslist targets",
		},
		schema: [],
		messages: {
			unsupported: "{{api}} is not supported in {{browsers}}",
			partial: "{{api}} is only partially implemented in {{browsers}}",
		},
	},
	create(context) {
		let services = context.sourceCode.parserServices;
		let checker = services?.program?.getTypeChecker();
		// no type information: the rule simply doesn't apply
		if (!checker || !services.esTreeNodeToTSNodeMap) return {};

		let targets = resolveTargets(context.filename);

		let check = (node, ifaces, property) => {
			for (let iface of ifaces) {
				// mdn suffixes statics, and names a constructor after its interface
				let feature =
					bcd.api[iface]?.[property] || bcd.api[iface]?.[`${property}_static`];
				let support = feature?.__compat?.support;
				if (!support) continue;

				let { missing, partial } = unsupportedIn(support, targets);
				let api = `${iface}.${property}`;
				if (missing.length)
					context.report({
						node,
						messageId: "unsupported",
						data: { api, browsers: missing.join(", ") },
					});
				else if (partial.length)
					context.report({
						node,
						messageId: "partial",
						data: { api, browsers: partial.join(", ") },
					});
				return;
			}
		};

		return {
			MemberExpression(node) {
				if (node.computed) return;
				let tsNode = services.esTreeNodeToTSNodeMap.get(node.property);
				let declaration = tsNode && libDeclaration(checker, tsNode);
				if (!declaration) return;

				let object = services.esTreeNodeToTSNodeMap.get(node.object);
				check(
					node.property,
					[
						declaringName(declaration),
						...(object ? typeNames(checker.getTypeAtLocation(object)) : []),
					],
					node.property.name
				);
			},
			NewExpression(node) {
				if (node.callee.type !== "Identifier") return;
				let tsNode = services.esTreeNodeToTSNodeMap.get(node.callee);
				// `new CSSStyleSheet()` lives at api.CSSStyleSheet.CSSStyleSheet
				if (tsNode && libDeclaration(checker, tsNode))
					check(node.callee, [node.callee.name], node.callee.name);
			},
		};
	},
};

export default { rules: { "no-unsupported": rule } };
