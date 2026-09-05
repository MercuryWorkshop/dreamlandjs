// the react app this replaced called a function react 19 had already removed, so
// it was measured for a long time without the renderer it was meant to measure.
// run every bundle in a dom to make sure the numbers mean something

import { Window } from "happy-dom";

import { frameworks, buildFramework } from "./index.ts";
import { computeBundleSize, formatKb } from "../compression.ts";

// give the bundle the same globals a browser would, without letting them leak
// into the process any longer than the app needs them
function installDom(): [Window, () => void] {
	let window = new Window({ url: "https://localhost/" });
	window.document.body.innerHTML = `<div id="app"></div>`;

	let restore: (() => void)[] = [];
	let define = (key: string, value: unknown) => {
		let old = Object.getOwnPropertyDescriptor(globalThis, key);
		Object.defineProperty(globalThis, key, {
			value,
			configurable: true,
			writable: true,
		});
		restore.push(() =>
			old
				? Object.defineProperty(globalThis, key, old)
				: delete (globalThis as any)[key]
		);
	};

	for (let key of Object.getOwnPropertyNames(window)) {
		if (key in globalThis && key !== "document" && key !== "location") continue;
		try {
			define(key, (window as any)[key]);
		} catch {
			// some globals are hostile to redefinition, none of them matter here
		}
	}
	define("window", window);
	define("document", window.document);

	return [window, () => restore.forEach((x) => x())];
}

let tick = () => new Promise((resolve) => setTimeout(resolve, 50));

let failed = false;
let rows: Record<string, string>[] = [];

for (let framework of frameworks) {
	let code = await buildFramework(framework);
	let size = await computeBundleSize(new TextEncoder().encode(code));

	let [window, restore] = installDom();
	let status = "ok";
	try {
		await import(
			`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
		);
		await tick();

		let button = window.document.querySelector("button");
		if (!button) throw new Error("nothing rendered");

		button.click();
		await tick();

		let html = window.document.body.innerHTML;
		if (!html.includes("1 clicks"))
			throw new Error(`state didn't update: ${html}`);
	} catch (err) {
		status = `FAILED: ${(err as Error).message}`;
		failed = true;
	} finally {
		restore();
	}

	rows.push({
		framework: framework.name,
		minified: `${formatKb(size.bundle)}kb`,
		gzip: `${formatKb(size.gzip)}kb`,
		brotli: `${formatKb(size.brotli)}kb`,
		status,
	});
}

console.table(rows);
if (failed) process.exit(1);
