import { ComponentInstance, stateProxy, FC, css } from "dreamland/core";
import { Route, router, Router, RouterState } from "dreamland/router";
import { MainPage } from "./pages/main";
import { jsx } from "dreamland/jsx-runtime";
import { docs } from "./docs";
import { DocsLayout } from "./pages/docs";
import { PlaygroundHost, showPlayground } from "./pages/playground";

declare global {
	interface DLComponentContextExtraProps {
		pageTitle: string;
	}
}

function FancyLoader(this: FC<{ routerState: RouterState }>) {
	return (
		<div>
			<div class="loading">{use(this.routerState.loading).and("loading...")}</div>
			{use(this.routerState.outlet)}
		</div>
	)
}
FancyLoader.style = css`
	:scope {
		height: 100%;
		position: relative;
	}

	.loading {
		position: absolute;
		top: 0;
		left: 0;
	}
`;

let routePromise: Promise<any>;
function App(this: FC<{ url?: string }, { el: ComponentInstance<any> }>) {
	let title = use(this.el).map(x => { let title = x?.$?.pageTitle; return (title ? title + " | " : "") + "dreamland.js" });

	this.cx.init = () => {
		stateProxy(this, "el", use(router.el as ComponentInstance<any>));
		if (import.meta.env.SSR) {
			routePromise = router.route(this.url, "http://127.0.0.1:5173");
		} else {
			routePromise = router.route();
		}
	};

	return (
		<>
			<div id="app">
				<Router>
					<Route layout={FancyLoader}>
						<Route show={<MainPage />} />
						<Route path="docs" layout={DocsLayout}>
							{docs.map(({ path, component }) => {
								return <Route path={path} show={async () => {await new Promise(r => setTimeout(r, 1000)); return jsx(component, {})}} />;
							})}
						</Route>
						<Route path="playground" layout={PlaygroundHost} show={showPlayground} />
					</Route>
				</Router>
			</div>
			<>
				<title attr:innerText={title}></title>
				<meta property="og:title" content={title} />
			</>
		</>
	);
}

export default async (url?: string) => {
	let app = <App url={url} />;
	await routePromise;
	return app;
};
