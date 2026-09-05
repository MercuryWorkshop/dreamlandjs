import { promisify } from "node:util";
import {
	gzip as gzipCb,
	brotliCompress as brotliCompressCb,
	constants,
} from "node:zlib";

let gzip = promisify(gzipCb);
let brotliCompress = promisify(brotliCompressCb);

// raw byte counts, formatting is left to whoever displays them
export interface BundleSize {
	bundle: number;
	gzip: number;
	brotli: number;
}

// the settings a static host would use, pinned so the numbers don't drift with
// the node version and so every bundle is measured identically
export async function computeBundleSize(
	bundle: Uint8Array
): Promise<BundleSize> {
	let [gzipped, brotlied] = await Promise.all([
		gzip(bundle, { level: 9 }),
		brotliCompress(bundle, {
			params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
		}),
	]);

	return {
		bundle: bundle.byteLength,
		gzip: gzipped.byteLength,
		brotli: brotlied.byteLength,
	};
}

export let formatKb = (bytes: number) => (bytes / 1024).toFixed(1);
