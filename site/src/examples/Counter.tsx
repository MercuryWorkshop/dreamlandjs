import { type FC } from "dreamland/core";

export function Counter(this: FC<{}, { count: number }>) {
	this.count = 0;

	return (
		<div>
			<h2>Counter!</h2>
			<button on:click={() => this.count++}>{use(this.count)} clicks</button>
		</div>
	);
}
