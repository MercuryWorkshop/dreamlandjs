import { type Component } from "dreamland/core";

const Counter: Component<{}, { counter: number }> = function () {
	this.counter = 0;

	return (
		<div>
			<h1>Counter!</h1>
			<div>{use(this.counter)} clicks</div>
			<button on:click={() => this.counter++}>Click!</button>
		</div>
	);
};

document.querySelector("#app")!.replaceWith(<Counter />);
