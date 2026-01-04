import {
	DLElement,
	Component,
	ComponentChild,
	h,
	Fragment,
	ComponentState,
	DREAMLAND,
} from "dreamland/core";

export type RouteParams = Record<string, string> & {
	// @internal
	[DREAMLAND]?: string;
};

export type ShowElement =
	| DLElement<{
			outlet?: HTMLElement;
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
): ShowElement | undefined;
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
): ShowElement | undefined {
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

let isComponent = (x: any): x is DLElement<any> => x.$;

let populateComponent = (
	el: ShowElement,
	required: boolean,
	path: string,
	params: RouteParams,
	outlet?: HTMLElement
) => {
	if (isComponent(el)) {
		// has an outlet
		let state = el.$.state;

		for (let param in params) {
			state[param] = params[param];
		}

		state.outlet = outlet;
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
	if (params[DREAMLAND] || route === "*") {
		params[DREAMLAND] += "/" + segment;
		return true;
	} else if (route.startsWith(":")) {
		// param
		params[route.substring(1)] = segment;
		return true;
	} else {
		return segment === route;
	}
};

let _route = (
	route: RouteInternal,
	path: string,
	segments: string[],
	params: RouteParams
): ShowElement | undefined => {
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
		if (
			(!segments.length ||
				(segments[0] === "" && indexRoute) ||
				params[DREAMLAND]) &&
			route._show
		) {
			if (params[DREAMLAND]) {
				params["*"] = params[DREAMLAND].slice(10);
				delete params[DREAMLAND];
			}
			// route matches fully
			let el = getShow(route, true, path, params);

			populateComponent(el, false, path, params);

			return el;
		} else {
			// matched, continue searching for children
			let paramsCopy = { ...params };

			let el: ShowElement | undefined;

			for (let child of route._children || []) {
				el = _route(child, path, [...segments], params);
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
	children?: ComponentChild;
	"on:click"?: () => void;
}> = function (cx) {
	this.class = this.class || "";

	return (
		<a
			href={use(this.href)}
			class={use(this.class)}
			on:click={(e: MouseEvent) => {
				e.preventDefault();
				dev: {
					if (!router) throw new Error("No router exists");
				}
				router.navigate(this.href);

				let x = this["on:click"];
				this["on:click"]?.();
			}}
		>
			{cx.children}
		</a>
	);
};

export let router: ComponentState<typeof Router>;
export let Router: Component<
	{
		children: HTMLElement | HTMLElement[];
	},
	{
		// @internal
		_el?: HTMLElement;
	},
	{
		route: (path?: string, origin?: string) => string | undefined;
		navigate: (path: string) => string | undefined;
		ssgables: () => [string, string][];
	}
> = function (cx) {
	dev: {
		if (router) throw new Error("A router was already created");
	}
	// eslint-disable-next-line @typescript-eslint/no-this-alias
	router = this;

	let routes = { _children: cx.children as any as RouteInternal[] };
	dev: {
		validateRoute(routes);
	}

	this.route = (
		path: string = location.pathname,
		origin: string = location.origin
	): string | undefined => {
		let realPath = new URL(path, origin).pathname;
		if (realPath.endsWith(".html"))
			realPath = realPath.slice(0, realPath.length - 5);
		let segments = realPath.split("/").slice(1);

		let el: HTMLElement | undefined = _route(
			routes,
			realPath,
			[...segments],
			{}
		);

		this._el = el;

		if (el) return realPath;
	};
	this.navigate = (path) => {
		let ret = this.route(path);
		if (ret) history.pushState(null, "", ret);
		return ret;
	};

	this.ssgables = () => {
		let traverse = (path: string, route: RouteInternal): [string, string][] => {
			if (route._path) {
				path += "/" + route._path;
			}

			if (route._children.length) {
				return route._children.map((x) => traverse(path, x)).flat();
			} else if (
				!route._path ||
				!(route._path.startsWith(":") || route._path === "*")
			) {
				return [
					[path || "/", route._path ? path + ".html" : path + "/index.html"],
				];
			} else {
				return [];
			}
		};
		return traverse("", routes);
	};

	cx.mount = () => {
		addEventListener("popstate", () => {
			this.route();
		});
	};

	return <>{use(this._el)}</>;
};
