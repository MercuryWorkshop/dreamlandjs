import { css, type FC } from "dreamland/core";

function Counter(this: FC<{ count: number }>) {
	return (
		<div>
			<div>Count: {use(this.count)}</div>
			<button on:click={() => this.count++}>{use`Count: ${this.count}`}</button>
		</div>
	);
}

function App(this: FC<{}, { count: number }>) {
	this.count = 0;

	return (
		<div id="app">
			<h1>Hello dreamland!</h1>
			<Counter count={use(this.count)} />
		</div>
	);
}
App.style = css`
	:scope {
		padding: 0 1rem;
	}
`;

document.querySelector("#app")!.replaceWith(<App />);
