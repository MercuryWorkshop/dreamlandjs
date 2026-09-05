import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { computeBundleSize, formatKb } from "./compression.ts";

export interface FrameworkSize {
	bundle: string;
	gzip: string;
	brotli: string;
}
export interface FrameworkInfo {
	dl: FrameworkSize;
	ssr: FrameworkSize;
	version: string;
}

let sizeOf = async (path: string): Promise<FrameworkSize> => {
	let { bundle, gzip, brotli } = await computeBundleSize(await readFile(path));
	return {
		bundle: formatKb(bundle),
		gzip: formatKb(gzip),
		brotli: formatKb(brotli),
	};
};

export async function getFrameworkInfo(): Promise<FrameworkInfo> {
	let root = resolve(import.meta.dirname, "../node_modules/dreamland/");
	let packageJson = JSON.parse(
		await readFile(resolve(root, "package.json"), "utf-8")
	);

	let dist = resolve(root, "dist");
	let dl = await sizeOf(resolve(dist, "core.js"));
	let ssr = await sizeOf(resolve(dist, "ssr.client.js"));

	return { dl, ssr, version: packageJson.version };
}
