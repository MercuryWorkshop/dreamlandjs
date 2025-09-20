import { css, type Component } from "dreamland/core";

let Counter: Component<{ count: number }> = function () {
	return (
		<div>
			<div>Count: {use(this.count)}</div>
			<button on:click={() => this.count++}>{use`Count: ${this.count}`}</button>
		</div>
	);
};

let App: Component<{}, { count: number }> = function () {
	this.count = 0;

	return (
		<div id="app">
			<h1>Hello dreamland!</h1>
			<Counter count={use(this.count)} />
		</div>
	);
};
App.style = css`
	:scope {
		padding: 0 1rem;
	}
`;

document.querySelector("#app")!.replaceWith(<App />);
