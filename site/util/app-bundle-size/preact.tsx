import { render } from "preact";
import { useState } from "preact/hooks";

function Counter() {
	const [count, setCount] = useState(0);

	return (
		<div>
			<h1>Counter!</h1>
			<div>{count} clicks</div>
			<button onClick={() => setCount((count) => count + 1)}>Click!</button>
		</div>
	);
}

render(<Counter />, document.querySelector("#app")!);
