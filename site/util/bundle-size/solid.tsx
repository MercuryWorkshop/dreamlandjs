import { createSignal } from "solid-js";
import { render } from "solid-js/web";

const Counter = () => {
	const [counter, setCounter] = createSignal(0);

	return (
		<div>
			<h1>Counter!</h1>
			<div>{counter()} clicks</div>
			<button onClick={() => setCounter(counter() + 1)}>Click!</button>
		</div>
	);
};

render(() => <Counter />, document.getElementById("app")!);
