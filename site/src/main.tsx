import type { Component } from "dreamland/core";
import { Route, router, Router } from "dreamland/router";
import { MainPage } from "./pages/main";
import { jsx } from "dreamland/jsx-runtime";
import { docs } from "./docs";
import { DocsLayout } from "./pages/docs";

let url: string | undefined;

let App: Component = function(cx) {
	cx.init = () => {
		if (import.meta.env.SSR) {
			router.route(url, "http://127.0.0.1:5173");
		} else {
			router.route();
		}
	};

	return (
		<div id="app">
			<Router>
				<Route show={<MainPage />} />
				<Route show={<DocsLayout />} path="docs">
					{docs.map(({ path, component }) => {
						return <Route path={path} show={() => jsx(component, {})} />;
					})}
				</Route>
			</Router>
		</div>
	);
};

export default (path?: string) => {
	url = path;
	return <App />;
};
