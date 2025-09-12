import type { Component } from "dreamland/core";
import { Route, router, Router } from "dreamland/router";
import { MainPage } from "./pages/main";
import { jsx } from "dreamland/jsx-runtime";

const docs = import.meta.glob("./docs/**/*.mdx", { eager: true });

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
				<Route path="docs">
					{Object.entries(docs).map(([path, component]) => {
						const name = path.replace("./docs/", "").replace(".mdx", "");
						return <Route path={name} show={() => jsx((component as any).default, {})} />;
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
