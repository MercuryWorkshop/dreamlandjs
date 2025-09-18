import { css, type Component } from "dreamland/core";
import { Monaco } from "./monaco";

export let Playground: Component<{}, {
	code: string,
	transpiled: string,
}> = function() {
	this.code = "";
	this.transpiled = "";

	use(this.code, this.transpiled).listen(x=>console.log(x));

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
