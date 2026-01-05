import { type FC } from "dreamland/core";

export function Counter(this: FC<{}, { counter: number }>) {
	this.counter = 0;

	return (
		<div>
			<h2>Counter!</h2>
			<button on:click={() => this.counter++}>
				{use(this.counter)} clicks
			</button>
		</div>
	);
}
