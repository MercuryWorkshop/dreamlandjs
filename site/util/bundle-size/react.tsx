import { useState } from "react";
import ReactDOM from "react-dom";

const Counter = () => {
	const [counter, setCounter] = useState(0);

	return (
		<div>
			<h1>Counter!</h1>
			<div>{counter} clicks</div>
			<button onClick={() => setCounter(counter + 1)}>Click!</button>
		</div>
	);
};

ReactDOM.render(<Counter />, document.getElementById("app"));
