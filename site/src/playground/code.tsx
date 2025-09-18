import { css, type Component } from "dreamland/core";

let App: Component = function() {
	return (
		<div id="app">
			<h1>Hello dreamland!</h1>
		</div>
	)
}
App.style = css`
	:scope {
		background: #111;
		color: #fff;
		padding: 1em;
	}

	h1 {
		margin: 0;
	}
`;

document.querySelector("#app")!.replaceWith(<App />)
