import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { renderSsr } from "dreamland/vite";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resolve = (p) => resolvePath(__dirname, p);

const entry = await import(resolve("dist/server/main-server.js"));

entry.default("/");
const paths = entry.router.ssgables();

let template = await readFile(resolve("dist/static/index.html"), "utf8");

for (const [route, path] of paths) {
	const rendered = await renderSsr(template, () => entry.default(route));
	console.log(
		`prerendered: ${route}\t${(new TextEncoder().encode(rendered).byteLength / 1024).toFixed(2)}kb`
	);
	let resolved = resolve("dist/static/" + path);
	await mkdir(dirname(resolved), { recursive: true });
	await writeFile(resolved, rendered);
}

await rm(resolve("dist/static/.vite"), { recursive: true });
