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
		input: "index.jsx",
		plugins: [
			{
				name: "loader",
				resolveId(source) {
					if (source === "index.jsx")
						return source;
					if (modules.has(source))
						return source;
				},
				load(source) {
					if (source === "index.jsx")
						return transpiled;
					if (modules.has(source))
						return modules.get(source);
				}
			}
		]
	});

	const output = await bundle.generate({ format: "es" });

	return output.output[0].code;
}
