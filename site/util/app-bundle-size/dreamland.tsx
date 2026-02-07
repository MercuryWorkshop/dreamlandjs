import { type FC } from "dreamland/core";

function Counter(this: FC<{}, { count: number }>) {
	this.count = 0;

	return (
		<div>
			<h1>Counter!</h1>
			<div>{use(this.count)} clicks</div>
			<button on:click={() => this.count++}>Click!</button>
		</div>
	);
}

document.querySelector("#app")!.replaceWith(<Counter />);
