import { css, type Component } from "dreamland/core";

import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

import dreamlandFiles from "./dreamland";

(self as any).MonacoEnvironment = {
	getWorker(_: any, label: any) {
		if (label === "json") {
			return new jsonWorker();
		}
		if (label === "css" || label === "scss" || label === "less") {
			return new cssWorker();
		}
		if (label === "html" || label === "handlebars" || label === "razor") {
			return new htmlWorker();
		}
		if (label === "typescript" || label === "javascript") {
			return new tsWorker();
		}
		return new editorWorker();
	},
};

let typescript = monaco.languages.typescript.typescriptDefaults;

typescript.setCompilerOptions({
	jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
	jsxImportSource: "dreamland",
	moduleResolution: 3 as any /* NodeNext */,
	module: monaco.languages.typescript.ModuleKind.ESNext,
	target: monaco.languages.typescript.ScriptTarget.ESNext,
	verbatimModuleSyntax: true,
});

let packageJson = {
	type: "module",
	dependencies: {
		dreamland: "*",
	},
};
let dreamland = dreamlandFiles.map(([path, content]) => ({
	content,
	filePath: monaco.Uri.file(path).toString(),
}));
typescript.setExtraLibs([
	...dreamland,
	{
		content: JSON.stringify(packageJson),
		filePath: monaco.Uri.file("package.json").toString(),
	},
]);

type TypeScriptWorkerInit = (
	...uris: monaco.Uri[]
) => Promise<monaco.languages.typescript.TypeScriptWorker>;
let tsReady: Promise<TypeScriptWorkerInit> = (async () => {
	let tryOnce = async () => {
		try {
			return await monaco.languages.typescript.getTypeScriptWorker();
		} catch (err) {
			if ((err as string)?.includes("TypeScript not registered!")) {
				return;
			} else {
				throw err;
			}
		}
	};

	let worker;
	while (!(worker = await tryOnce())) {
		let dummy = monaco.editor.create(document.createElement("div"), {
			value: "",
			language: "typescript",
		});
		dummy.dispose();
		console.log("ts worker not ready yet");

		await new Promise((r) => setTimeout(r, 100));
	}
	console.log("ts worker ready");
	return worker;
})();

export let Monaco: Component<{ value: string; transpiled: string }> = function (
	cx
) {
	let register = async (model: monaco.editor.IModel) => {
		let worker = await tsReady;
		let proxy = await worker(model.uri);

		let recompile = async () => {
			setting = true;
			this.value = model.getValue();

			let out = await proxy.getEmitOutput(model.uri.toString());
			this.transpiled = out.outputFiles[0].text;
		};

		let setting = false;
		model.onDidChangeContent(recompile);
		use(this.value).listen((x) => {
			if (!setting) model.setValue(x);
		});

		await recompile();
	};

	cx.mount = () => {
		let editor = monaco.editor.create(cx.root, {
			model: monaco.editor.createModel(
				this.value,
				"typescript",
				monaco.Uri.file("index.tsx")
			),
			automaticLayout: true,
			theme: "vs-dark",
		});
		let model = editor.getModel()!;

		register(model);
	};

	return <div class="monaco" />;
};
Monaco.style = css`
	:scope {
		width: 100%;
		height: 100%;
	}

	:scope > :global(.monaco-editor) {
		position: absolute;
	}
`;
