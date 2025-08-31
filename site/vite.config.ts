import { defineConfig } from "vite";
import { devSsr } from "dreamland/vite";

import { readFile } from "fs/promises";
import { gzipSync, brotliCompressSync } from "zlib";

const bundle = await readFile("node_modules/dreamland/dist/core.js");
const uncompressed = bundle.byteLength;
const gzip = gzipSync(bundle).byteLength;
const brotli = brotliCompressSync(bundle).byteLength;

process.env.VITE_ENV_BUNDLE_SIZE = (uncompressed / 1024).toFixed(1);
process.env.VITE_ENV_GZIP_SIZE = (gzip / 1024).toFixed(1);
process.env.VITE_ENV_BROTLI_SIZE = (brotli / 1024).toFixed(1);

export default defineConfig({
	plugins: [
		devSsr({
			entry: "/src/main-server.ts",
		}),
	],
});
