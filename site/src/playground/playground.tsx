import { css, type Component } from "dreamland/core";
import { Monaco } from "./monaco";
import { compile } from "./rollup";

import code from "./code?raw";

export let Playground: Component<{}, {
	code: string,
	transpiled: string,
}> = function() {
	this.code = code;
	this.transpiled = "";

	use(this.transpiled).listen(async val => {
		console.log(await compile(val));
	});

	return (
		<div>
			Dreamland 2 Playground
			<Monaco value={use(this.code)} transpiled={use(this.transpiled)} />
		</div>
	)
}
Playground.style = css`
	:scope {
		width: 100%;
		height: 100%;
	}
`;
