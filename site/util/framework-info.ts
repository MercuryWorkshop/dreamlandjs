import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gzip as gzipCb, brotliCompress as brotliCompressCb } from "node:zlib";
import { resolve } from "node:path";

let gzip = promisify(gzipCb);
let brotliCompress = promisify(brotliCompressCb);

export interface BundleSize {
	bundle: string;
	gzip: string;
	brotli: string;
}
export interface FrameworkInfo {
	dl: BundleSize;
	ssr: BundleSize;
	version: string;
}

let computeBundleSize = async (bundle: Uint8Array): Promise<BundleSize> => ({
	bundle: (bundle.byteLength / 1024).toFixed(1),
	gzip: ((await gzip(bundle)).byteLength / 1024).toFixed(1),
	brotli: ((await brotliCompress(bundle)).byteLength / 1024).toFixed(1),
});

export async function getFrameworkInfo(): Promise<FrameworkInfo> {
	let root = resolve(import.meta.dirname, "../node_modules/dreamland/");
	let packageJson = JSON.parse(
		await readFile(resolve(root, "package.json"), "utf-8")
	);

	let dist = resolve(root, "dist");
	let dl = await computeBundleSize(await readFile(resolve(dist, "core.js")));
	let ssr = await computeBundleSize(
		await readFile(resolve(dist, "ssr.client.js"))
	);

	return { dl, ssr, version: packageJson.version };
}
