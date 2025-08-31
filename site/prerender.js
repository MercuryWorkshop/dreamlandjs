import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { renderSsr } from "dreamland/vite";
import { rm, writeFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resolve = (p) => resolvePath(__dirname, p);

const entry = await import(resolve("dist/server/main-server.js"));

const rendered = await renderSsr(
	resolve("dist/static/index.html"),
	entry.default
);
console.log(
	`prerendered: / ${(new TextEncoder().encode(rendered).byteLength / 1024).toFixed(2)}kb`
);
await writeFile(resolve("dist/static/index.html"), rendered);
rm(resolve("dist/static/.vite"), { recursive: true });
