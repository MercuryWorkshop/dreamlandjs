import { css, type FC } from "dreamland/core";
import { Monaco } from "./monaco";
import { compile } from "./rollup";

import code from "./code?raw";

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
	let timeout: any;
	return (...args: Parameters<T>): void => {
		clearTimeout(timeout);
		timeout = setTimeout(() => fn(...args), delay);
	};
}

let compiling = `
	<div style="background: #111; color: #fff; box-sizing: border-box; position: absolute; width: 100%; height: 100%; top: 0; left: 0; padding: 1em;">
		<h1 style="margin: 0;">Compiling...</h1>
	</div>
`;

let error = (err: string) => `
	<div style="background: #111; color: #fff; box-sizing: border-box; position: absolute; width: 100%; height: 100%; top: 0; left: 0; padding: 1em;">
		<h1 style="margin: 0;">Error compiling</h1>
		<pre style="overflow-wrap: anywhere; white-space: pre-wrap;">${err}</pre>
	</div>
`;

let compiled = (code: string) => `
<html>
	<head>
		<style>
			html, body {
				padding: 0;
				margin: 0;
				width: 100%;
				height: 100%;
				background: #111;
				color: #fff;
			}
		</style>
	</head>
	<body>
		<div id="app"></div>
		<script>${code}</script>
	</body>
</html>
`;

export function Playground(
	this: FC<
		{},
		{
			code: string;
			transpiled: string;
			output: string;
		}
	>
) {
	this.code = code;
	this.transpiled = "";
	this.output = compiling;

	let idx = -1;

	use(this.transpiled).listen(
		debounce(async (val) => {
			idx++;
			let current = idx;

			this.output = compiling;
			try {
				let res = await compile(val);
				if (idx === current) this.output = compiled(res);
			} catch (err) {
				if (idx === current) this.output = error(err as any);
			}
		}, 200)
	);

	return (
		<div>
			<Monaco value={use(this.code)} transpiled={use(this.transpiled)} />
			<iframe srcdoc={use(this.output)} />
		</div>
	);
}
Playground.style = css`
	:scope {
		width: 100%;
		height: 100%;

		display: flex;
		flex-direction: row;
		gap: 0.5rem;
	}

	:scope > :global(.monaco),
	iframe {
		flex: 1;
	}

	iframe {
		border: none;
	}

	@media (max-width: 1000px) {
		:scope {
			flex-direction: column;
		}
	}
`;
