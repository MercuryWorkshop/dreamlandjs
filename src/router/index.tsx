import {
	ComponentChild,
	Component,
	ComponentState,
	h,
	Fragment,
	DREAMLAND,
	FC,
    Stateful,
    ComponentInstance,
    createState,
} from "dreamland/core";

export type RouteParams = Stateful<Record<string, string>> & {
	// @internal
	[DREAMLAND]?: string;
};

interface _RouterState {
	params: RouteParams;
	path: string;
	outlet: HTMLElement;
}
export type RouterState = Stateful<_RouterState>;

export type LayoutComponent = Component<{ routerState: RouterState }>;

export type ShowElement = ComponentInstance<Component<{ routerParams: RouteParams }>> | HTMLElement;
export type ShowTarget =
	| ShowElement
	| ((path: string, params: RouteParams) => ShowElement);

interface RouteInternal {
	_path?: string;
	_layout?: LayoutComponent;
	_layoutInstance?: ComponentInstance<LayoutComponent>;
	_show?: ShowTarget;
	_children: RouteInternal[];
}
let validateRoute = (route: RouteInternal) => {
	let hasIndex = false;
	if (route._children) {
		if (route._show)
			throw new Error("A route can't both show a page and have child pages. Use an index page.");

		for (let child of route._children) {
			if (!child._path && !child._children) {
				if (hasIndex)
					throw new Error("A route cannot have multiple index pages");
				hasIndex = true;
			}
			validateRoute(child);
		}
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

function _isComponent<T extends Component<any, any>>(x: ComponentInstance<T> | HTMLElement): x is ComponentInstance<T> {
	return (x as any).$;
}
let isComponent = _isComponent;

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
		params[route.slice(1)] = segment;
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
		let el: ShowElement | undefined;
		if (
			(!segments.length ||
				(segments[0] === "" && indexRoute) ||
				params[DREAMLAND])
			&& !route._children.length
		) {
			if (params[DREAMLAND]) {
				params["*"] = params[DREAMLAND].slice(10);
				delete params[DREAMLAND];
			}

			// route matches fully
			el = getShow(route, true, path, params);

			if (isComponent(el))
				el.$.state.routerParams = params;
		} else {
			// matched, continue searching for children
			for (let child of route._children || []) {
				el = _route(child, path, [...segments], params);
				if (el) break;
			}
		}

		if (el && route._layout) {
			let state = createState({ params, path, outlet: el });

			if (!route._layoutInstance) {
				route._layoutInstance = <route._layout routerState={state} /> as ComponentInstance<LayoutComponent>;
			} else {
				route._layoutInstance.$.state.routerState = state;
			}

			return route._layoutInstance;
		}

		return el;
	}
};

export function Route(
	this: FC<{
		path?: string;
		show?: ShowTarget;
		layout?: LayoutComponent;
		children?: ComponentChild;
	}>
) {
	return {
		_path: this.path,
		_show: this.show,
		_layout: this.layout,
		_children: this.children as any as RouteInternal[],
	} satisfies RouteInternal as any;
}

export function Link(
	this: FC<{
		href: string;
		class?: string;
		children?: ComponentChild;
		"on:click"?: () => void;
	}>
) {
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

				this["on:click"]?.();
			}}
		>
			{this.children}
		</a>
	);
}

export let router: ComponentState<typeof Router>;
export function Router(
	this: FC<
		{
			children: HTMLElement | HTMLElement[];
		},
		{
			// @internal
			_el?: HTMLElement;

			route: (path?: string, origin?: string) => string | undefined;
			navigate: (path: string) => string | undefined;
			ssgables: () => [string, string][];
		}
	>
) {
	// eslint-disable-next-line @typescript-eslint/no-this-alias
	router = this;

	let routes = { _children: this.children as any as RouteInternal[] };
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
			createState({})
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

	this.cx.mount = () => {
		addEventListener("popstate", () => {
			this.route();
		});
	};

	return <>{use(this._el)}</>;
}
