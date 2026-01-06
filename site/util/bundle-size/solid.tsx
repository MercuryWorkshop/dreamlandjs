import { createSignal } from "solid-js";
import { render } from "solid-js/web";

const Counter = () => {
	const [count, setCounter] = createSignal(0);

	return (
		<div>
			<h1>Counter!</h1>
			<div>{count()} clicks</div>
			<button onClick={() => setCounter(count() + 1)}>Click!</button>
		</div>
	);
};

render(() => <Counter />, document.getElementById("app")!);
