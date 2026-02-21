import { ComponentInstance, stateProxy, FC, css } from "dreamland/core";
import { Route, router, Router, RouterState } from "dreamland/router";
import { jsx } from "dreamland/jsx-runtime";
import { docComponents } from "./docs";
import { DocsLayout } from "./pages/docs";
import { PlaygroundHost, showPlayground } from "./pages/playground";

declare global {
	interface DLComponentContextExtraProps {
		pageTitle: string;
	}
}

function FancyLoader(
	this: FC<{ routerState: RouterState }, { loads: number }>
) {
	return (
		<div>
			<div
				class="loader"
				class:initial={use(this.routerState.initial)}
				class:loading={use(this.routerState.loading)}
			>
				<div class="bar" />
			</div>
			{use(this.routerState.outlet)}
		</div>
	);
}
FancyLoader.style = css`
	:scope {
		height: 100%;
	}

	.loader {
		position: fixed;
		z-index: 100;
		top: 0;
		left: 0;
		width: 100%;
		height: 2px;
	}
	.loader.initial {
		display: none;
	}

	.bar {
		width: 0;
		height: 100%;
		background: var(--accent);
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.loading .bar {
		opacity: 1;
		animation: 15s
			linear(
				0,
				0.175,
				0.32,
				0.44,
				0.54,
				0.62 17.2%,
				0.73,
				0.81,
				0.87 36.1%,
				0.926,
				0.96 55.6%,
				0.99,
				1
			)
			1 forwards fancyloader-progress;
	}

	.loader:not(.loading) .bar {
		animation: fancyloader-complete 0.5s ease-out forwards;
	}

	@keyframes fancyloader-progress {
		0% {
			width: 0%;
		}
		100% {
			width: 100%;
		}
	}

	@keyframes fancyloader-complete {
		0% {
			width: var(--final-width, 90%);
			opacity: 1;
		}
		90% {
			width: 100%;
			opacity: 1;
		}
		100% {
			width: 100%;
			opacity: 0;
		}
	}
`;

function App(this: FC<{ url?: string }, { el: ComponentInstance<any> }>) {
	let title = use(this.el).map((x) => {
		let title = x?.$?.pageTitle;
		return (title ? title + " | " : "") + "dreamland.js";
	});

	this.cx.init = () => {
		stateProxy(this, "el", use(router.el as ComponentInstance<any>));
	};

	return (
		<>
			<div id="app">
				<Router initial={this.url ? [this.url, "http://127.0.0.1:5173"] : []}>
					<Route layout={FancyLoader}>
						<Route
							show={() => import("./pages/main").then((r) => <r.default />)}
						/>
						<Route path="docs" layout={DocsLayout}>
							{docComponents.map(([path, component]) => {
								return (
									<Route
										path={path}
										show={async () => jsx(await component(), {})}
									/>
								);
							})}
						</Route>
						<Route
							path="playground"
							layout={PlaygroundHost}
							show={showPlayground}
						/>
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

export default async (url?: string) => <App url={url} />;
