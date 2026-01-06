import { createSignal } from "solid-js";
import { render } from "solid-js/web";

function Counter() {
	const [count, setCount] = createSignal(0);

	return (
		<div>
			<h1>Counter!</h1>
			<div>{count()} clicks</div>
			<button onClick={() => setCount((count) => count + 1)}>Click!</button>
		</div>
	);
}

render(() => <Counter />, document.getElementById("app")!);
