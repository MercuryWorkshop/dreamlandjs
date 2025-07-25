import { DLElement, Component, ComponentChild, h } from "dreamland/core";

export type RouteParams = Record<string, string>;

export type ShowElement =
	| DLElement<{
			outlet: HTMLElement | null | undefined;
			"on:routeshown"?: (path: string) => void;

			[index: string]: any;
	  }>
	| HTMLElement;
export type ShowTarget =
	| ShowElement
	| ((path: string, params: RouteParams) => ShowElement);

interface RouteInternal {
	_path?: string;
	_show?: ShowTarget;
	_children: RouteInternal[];
}
let validateRoute = (route: RouteInternal) => {
	let hasIndex = false;
	if (route._children)
		for (let child of route._children) {
			if (!child._path && !child._children) {
				if (hasIndex)
					throw new Error("A route cannot have multiple index pages");
				hasIndex = true;
			}
			validateRoute(child);
		}
};
function _getShow(
	route: RouteInternal,
	required: false,
	path: string,
	params: RouteParams
): ShowElement | null;
function _getShow(
	route: RouteInternal,
	required: true,
	path: string,
	params: RouteParams
): ShowElement;
function _getShow(
	route: RouteInternal,
	required: boolean,
	path: string,
	params: RouteParams
): ShowElement | null {
	let show = route._show;
	dev: {
		if (required && !show)
			throw new Error(
				`Unable to navigate to ${path}, route had no show target`
			);
	}
	return show instanceof Function ? show(path, params) : show;
}
let getShow = _getShow;

let populateComponent = (
	el: ShowElement,
	required: boolean,
	path: string,
	params: RouteParams,
	outlet?: HTMLElement
) => {
	if ("$" in el) {
		// has an outlet
		let state = el.$.state;

		for (let param in params) {
			state[param] = params[param];
		}

		if (outlet) state.outlet = outlet;
		state["on:routeshown"]?.(path);
	} else if (required) {
		dev: {
			throw new Error(
				`Unable to navigate to ${path}, route's show target was not a component`
			);
		}
	}
};

let matchRoute = (
	segment: string,
	route: string,
	params: RouteParams
): boolean => {
	if (route.startsWith(":")) {
		// param
		params[route.substring(1)] = segment;
		return true;
	} else {
		return segment === route;
	}
};

export let Route: Component<{
	path?: string;
	show?: ShowTarget;
	children?: ComponentChild;
}> = function (cx) {
	return {
		_path: this.path,
		_show: this.show,
		_children: cx.children as any as RouteInternal[],
	} satisfies RouteInternal as any;
};

export let Link: Component<{
	href: string;
	class?: string;
}> = function (cx) {
	this.class = this.class || "";

	return (
		<a
			href={this.href}
			class={use(this.class)}
			on:click={(e: MouseEvent) => {
				e.preventDefault();
				dev: {
					if (!Router._instance) throw new Error("No router exists");
				}
				Router._instance.navigate((cx.root as HTMLAnchorElement).href);
			}}
		>
			{cx.children}
		</a>
	);
};

export class Router {
	// @internal
	_el?: HTMLElement;
	// @internal
	_routes: RouteInternal;

	// @internal
	static _instance: Router | null;

	constructor(route: HTMLElement) {
		dev: {
			if (route instanceof HTMLElement) throw new Error("invalid route");
			if (Router._instance) throw new Error("A router was already created");
			validateRoute(route);
		}

		this._routes = route;
		Router._instance = this;
	}

	mount(root: HTMLElement) {
		this._el = root;
		this.route();

		addEventListener("popstate", () => {
			this.route();
		});
	}

	navigate(path: string): boolean {
		let ret = this.route(path);
		if (ret) history.pushState(null, "", path);
		return ret;
	}

	route(path: string = location.pathname): boolean {
		dev: {
			if (!this._el)
				throw new Error("Attempted to route without mounting the router");
		}

		let realPath = new URL(path, location.origin).pathname;
		let segments = realPath.split("/").slice(1);

		let el: HTMLElement | null = this._route(
			this._routes,
			realPath,
			[...segments],
			{}
		);

		if (el) {
			if (el !== this._el) {
				this._el.replaceWith(el);
				this._el = el;
			}
			// otherwise it was just some outlet change
		}

		return !!el;
	}

	// @internal
	_route(
		route: RouteInternal,
		path: string,
		segments: string[],
		params: RouteParams
	): ShowElement | null {
		let routePath: string[] = [];
		let indexRoute = false;
		if (route._path) {
			// has a path
			routePath = route._path.split("/");
		} else if (route._children.length) {
			// will always match
		} else {
			// index route
			indexRoute = true;
		}

		if (
			!routePath.length ||
			segments
				.splice(0, routePath.length)
				.every((x, i) => matchRoute(x, routePath[i], params))
		) {
			if (!segments.length || (segments[0] === "" && indexRoute)) {
				// route matches fully
				let el = getShow(route, true, path, params);

				populateComponent(el, false, path, params);

				return el;
			} else {
				// matched, continue searching for children
				let paramsCopy = { ...params };

				let el: ShowElement | undefined;

				for (let child of route._children || []) {
					el = this._route(child, path, [...segments], params);
					if (el) break;
				}

				if (el) {
					let show = getShow(route, false, path, paramsCopy);

					if (show) {
						populateComponent(show, true, path, params, el);
						return show;
					}

					return el;
				}
			}
		}

		return null;
	}
}
