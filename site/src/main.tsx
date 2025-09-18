import { createState, type Component, type Stateful } from "dreamland/core";
import { Route, router, Router } from "dreamland/router";
import { MainPage } from "./pages/main";
import { jsx } from "dreamland/jsx-runtime";
import { docs } from "./docs";
import { DocsLayout } from "./pages/docs";

let page: Stateful<{
	title: string;
	url?: string;
}> = createState({
	title: "dreamland.js",
});

export let setTitle = (val?: string | undefined) =>
	(page.title = (val ? val + " | " : "") + "dreamland.js");

let App: Component<{}, { title: HTMLTitleElement }> = function (cx) {
	cx.init = () => {
		use(page.title).listen((title) => {
			this.title.innerText = title;
		});

		if (import.meta.env.SSR) {
			router.route(page.url, "http://127.0.0.1:5173");
		} else {
			router.route();
		}
	};

	return (
		<>
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
			<>
				<title this={use(this.title)}></title>
				<meta property="og:title" content={use(page.title)} />
			</>
		</>
	);
};

export default (path?: string) => {
	page.url = path;
	return <App />;
};
