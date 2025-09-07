import type { Component } from "dreamland/core";
import { Route, router, Router } from "dreamland/router";
import { MainPage } from "./pages/main";
import { Test } from "./pages/test";

let url: string | undefined;

let App: Component = function(cx) {
	cx.init = () => {
		if (import.meta.env.SSR) {
			router.route(url, "http://127.0.0.1:5173");
		}
	};

	return (
		<div id="app">
			<Router>
				<Route show={<MainPage />} />
				<Route path="test" show={<Test />} />
			</Router>
		</div>
	);
};

export default (path?: string) => {
	url = path;
	return <App />;
};
