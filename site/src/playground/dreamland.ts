let imports = Object.entries(import.meta.glob([
	"../../node_modules/dreamland/dist/*.js",
	"../../node_modules/dreamland/dist/*.d.ts",
	"../../node_modules/dreamland/package.json",
], { eager: true, query: "?raw", import: "default" }))
	.map(([k, v]) => [k.slice(6), v as string]);

export default imports;
