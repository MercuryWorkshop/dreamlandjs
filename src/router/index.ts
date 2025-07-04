import { Component, DLElement } from "dreamland/core";

export * from "./components";

export type RouteParams = Record<string, string>;

export type ShowTarget =
	| DLElement<
			Component & {
				outlet: HTMLElement | null | undefined;
				"on:routeshown"?: (path: string) => void;

				[index: string]: any;
			}
	  >
	| HTMLElement;

export interface Route {
	path?: string;
	show?: ShowTarget | ((path: string, params: RouteParams) => ShowTarget);
	children?: Route[];
}

let validateRoute = (route: Route) => {
	let hasIndex = false;
	if (route.children)
		for (let child of route.children) {
			if (!child.path && !child.children) {
				if (hasIndex)
					throw new Error("A route cannot have multiple index pages");
				hasIndex = true;
			}
			validateRoute(child);
		}
};

function _getShow(
	route: Route,
	required: false,
	path: string,
	params: RouteParams
): ShowTarget | null;
function _getShow(
	route: Route,
	required: true,
	path: string,
	params: RouteParams
): ShowTarget;
function _getShow(
	route: Route,
	required: boolean,
	path: string,
	params: RouteParams
): ShowTarget {
	let show = route.show;
	if (required && !show)
		throw new Error(`Unable to navigate to ${path}, route had no show target`);
	return show instanceof Function ? show(path, params) : show;
}
let getShow = _getShow;

let populateComponent = (
	el: ShowTarget,
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
		throw new Error(
			`Unable to navigate to ${path}, route's show target was not a component`
		);
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

export class Router {
	// @internal
	_el?: HTMLElement;
	// @internal
	_routes: Route[];

	// @internal
	static _instance: Router | null;

	constructor(routes: Route[]) {
		if (Router._instance) throw new Error("A router was already created");

		for (let route of routes) validateRoute(route);

		this._routes = routes;
		Router._instance = this;
	}

	mount(root: HTMLElement) {
		this._el = root;
		this.route(location.pathname);

		addEventListener("popstate", () => {
			this.route(location.pathname);
		});
	}

	navigate(path: string): boolean {
		let ret = this.route(path);
		if (ret) history.pushState(null, "", path);
		return ret;
	}

	route(path: string): boolean {
		if (!this._el)
			throw new Error("Attempted to route without mounting the router");

		let realPath = new URL(path, location.origin).pathname;
		let segments = realPath.split("/").slice(1);

		let el: HTMLElement | undefined | null;
		for (let route of this._routes) {
			el = this._route(route, realPath, [...segments], {});
			if (el) break;
		}

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
		route: Route,
		path: string,
		segments: string[],
		params: RouteParams
	): ShowTarget | null {
		let routePath: string[] = [];
		let indexRoute = false;
		if (route.path) {
			// has a path
			routePath = route.path.split("/");
		} else if (route.children) {
			// will always match
		} else {
			// index route
			indexRoute = true;
		}

		if (
			routePath.length === 0 ||
			segments
				.splice(0, routePath.length)
				.every((x, i) => matchRoute(x, routePath[i], params))
		) {
			if (segments.length === 0 || (segments[0] === "" && indexRoute)) {
				// route matches fully
				let el = getShow(route, true, path, params);

				populateComponent(el, false, path, params);

				return el;
			} else {
				// matched, continue searching for children
				let paramsCopy = { ...params };

				let el: ShowTarget | undefined;

				if (route.children)
					for (let child of route.children) {
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
