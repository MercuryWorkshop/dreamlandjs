import type { Component } from "dreamland/core";
import { Route, Router } from "dreamland/router";
import { MainPage } from "./pages/main";
import { Test } from "./pages/test";

export let router: Router;
let url: string | undefined;

let App: Component = function(cx) {
	router = new Router(
		<Route>
			<Route show={<MainPage />} />
			<Route path="test" show={<Test />} />
		</Route>
	);

	cx.init = () => {
		if (import.meta.env.SSR) {
			router.mount(cx.root.firstChild! as HTMLElement, true);
			router.route(url, "http://127.0.0.1:5173");
		} else {
			router.mount(cx.root.firstChild! as HTMLElement);
		}
	}

	return (
		<div id="app"><placeholder /></div>
	)
}

export default (path?: string) => {
	url = path;
	return <App />;
}
