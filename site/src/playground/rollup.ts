import { rollup } from "@rollup/browser";
import dreamland from "./dreamland";

let packageJson = JSON.parse(dreamland.find(([k]) => k.endsWith("package.json"))![1]) as any;
let modules = new Map(Object.entries(packageJson.exports).map(([k, v]: any) => {
	return [
		"dreamland" + k.slice(1),
		dreamland.find(([k]) => k.endsWith(v.default.slice(1)))![1],
	];
}));

export async function compile(transpiled: string): Promise<string> {
	const bundle = await rollup({
		input: "index.js",
		plugins: [
			{
				name: "loader",
				resolveId(source) {
					if (source === "index.js" || modules.has(source))
						return "\0" + source;
				},
				load(source) {
					if (source === "\0index.js")
						return transpiled;
					if (source.startsWith("\0") && modules.has(source.slice(1)))
						return modules.get(source.slice(1));
				}
			}
		],
		logLevel: "debug",
	});

	const output = await bundle.generate({ format: "es" });

	return output.output[0].code;
}
