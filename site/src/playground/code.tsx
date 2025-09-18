import { type Component } from "dreamland/core";

let App: Component = function() {
	return (
		<div>
			<h1>Hello dreamland!</h1>
		</div>
	)
}

document.querySelector("#app")!.replaceWith(<App />)
