import rollupWasm from "../../node_modules/@rollup/browser/dist/bindings_wasm_bg.wasm?url";

if (!import.meta.env.SSR) {
	let orgURL = URL as any;

	globalThis.URL = function(...args: any[]) {
		if (typeof args[0] === "string" && args[0].includes("bindings_wasm_bg")) {
			console.log("rollup hackfix");
			return new Request(rollupWasm);
		}
		return new orgURL(...args);
	} as any;
	globalThis.URL.createObjectURL = orgURL.createObjectURL;
	globalThis.URL.revokeObjectURL = orgURL.revokeObjectURL;
	globalThis.URL.parse = orgURL.parse;
	globalThis.URL.canParse = orgURL.canParse;
}
