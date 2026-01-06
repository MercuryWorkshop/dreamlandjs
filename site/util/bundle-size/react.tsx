import { useState } from "react";
import ReactDOM from "react-dom";

const Counter = () => {
	const [count, setCounter] = useState(0);

	return (
		<div>
			<h1>Counter!</h1>
			<div>{count} clicks</div>
			<button onClick={() => setCounter(count + 1)}>Click!</button>
		</div>
	);
};

ReactDOM.render(<Counter />, document.getElementById("app"));
