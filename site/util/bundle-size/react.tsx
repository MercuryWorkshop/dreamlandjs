import { useState } from "react";
import ReactDOM from "react-dom";

function Counter() {
	const [count, setCount] = useState(0);

	return (
		<div>
			<h1>Counter!</h1>
			<div>{count} clicks</div>
			<button onClick={() => setCount(count + 1)}>Click!</button>
		</div>
	);
};

ReactDOM.render(<Counter />, document.getElementById("app"));
