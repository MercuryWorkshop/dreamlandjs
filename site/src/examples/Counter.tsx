import { type Component } from "dreamland/core";

export const Counter: Component<
	{},
	{
		counter: number;
	}
> = function () {
	this.counter = 0;

	return (
		<div>
			<h2>Counter!</h2>
			<button on:click={() => this.counter++}>
				{use(this.counter)} clicks
			</button>
		</div>
	);
};
