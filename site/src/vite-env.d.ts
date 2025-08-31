/// <reference types="vite/client" />

interface ViteTypeOptions {
	strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
	readonly VITE_ENV_BUNDLE_SIZE: string;
	readonly VITE_ENV_GZIP_SIZE: string;
	readonly VITE_ENV_BROTLI_SIZE: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
