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

function FancyLoader(this: FC<{ routerState: RouterState }, { initialLoad: boolean }>) {
	this.initialLoad = true;
	use(this.routerState.loading).constrain(this).listen(x => { if (x && !import.meta.env.SSR) this.initialLoad = false });
	return (
		<div>
			<div class="loader" class:initial={use(this.initialLoad)} class:loading={use(this.routerState.loading)}><div class="bar" /></div>
			{use(this.routerState.outlet)}
		</div>
	)
}
FancyLoader.style = css`
	:scope {
		height: 100%;
		--timing: linear(0, .175, .32, .44, .54, .62 17.2%, .73, .81, .87 36.1%, .926, .96 55.6%, .99, 1);
		--duration: 15s;
	}

	.loader {
		position: fixed;
		z-index: 100;
		top: 0;
		left: 0;
		width: 100%;
		height: 4px;
	}
	.loader.initial { display: none; }

	.bar {
		width: 0;
		height: 100%;
		background: linear-gradient(90deg, #3b82f6, #8b5cf6);
		box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.loading .bar {
		opacity: 1;
		animation: progress var(--duration) var(--timing) infinite;
	}

	@keyframes progress {
		0% { width: 0%; }
		90% { width: 90%; }
		100% { width: 100%; }
	}

	.loader:not(.loading) .bar {
		animation: completeAndFade 0.5s ease-out forwards;
	}

	@keyframes completeAndFade {
		0% { width: var(--final-width, 90%); opacity: 1; }
		90% { width: 100%; opacity: 1; }
		100% { width: 100%; opacity: 0; }
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
