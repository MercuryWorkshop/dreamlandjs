import {
	ComponentChild,
	Component,
	ComponentState,
	h,
	Fragment,
	DREAMLAND,
	FC,
	ComponentInstance,
	NO_CHANGE,
} from "dreamland/core";

export type RouteParams = Record<string, string> & {
	// @internal
	[DREAMLAND]?: string;
	[NO_CHANGE]: true;
};

export interface RouterState {
	params: RouteParams;
	path: string;
	outlet?: HTMLElement;
	loading: boolean;
	initial: boolean;
	[NO_CHANGE]: true;
}

export type LayoutComponent = Component<{ routerState: RouterState }>;

export type ShowElement =
	| ComponentInstance<Component<{}, { routerParams: RouteParams }>>
	| HTMLElement;
type _MaybeShowEl = ShowElement | undefined;
type _MaybePromiseShowEl = Promise<_MaybeShowEl> | _MaybeShowEl;
export type ShowTarget = _MaybePromiseShowEl | (() => _MaybePromiseShowEl);

interface RouteInternal {
	_path?: string;
	_layout?: LayoutComponent;
	_layoutInstance?: ComponentInstance<LayoutComponent>;
	_show?: ShowTarget;
	_showInstance?: ShowElement;
	_children: RouteInternal[];
}
let validateRoute = (route: RouteInternal) => {
	let hasIndex = false;
	if (route._children.length) {
		if (route._show)
			throw new Error(
				"A route can't both show a page and have child pages. Use an index page."
			);

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

function _isComponent<T extends Component<any, any>>(
	x: ComponentInstance<T> | HTMLElement
): x is ComponentInstance<T> {
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
): RouteInternal[] => {
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

	let ret: RouteInternal[] = [];

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
			!route._children.length
		) {
			if (params[DREAMLAND]) {
				params["*"] = params[DREAMLAND].slice(10);
				delete params[DREAMLAND];
			}
			// route matches fully
			ret = [route];
		} else {
			// matched, continue searching for children
			for (let child of route._children || []) {
				ret = _route(child, path, [...segments], params);
				if (ret.length) break;
			}
			if (ret.length) ret.unshift(route);
		}
	}

	return ret;
};

async function _getShow(
	_instance: ShowElement | undefined,
	show: ShowTarget,
	params: RouteParams
): Promise<ShowElement | undefined> {
	let instance =
		_instance || (await (show instanceof Function ? show() : show));
	if (!instance) return;

	if (isComponent(instance)) instance.$.state.routerParams = params;
	return instance;
}
let getShow = _getShow;

let _handleLayout = (
	route: RouteInternal,
	ret: ReconcileRet | undefined,
	path: string,
	params: RouteParams,
	initial: boolean
): ReconcileRet | undefined => {
	if (route._layout) {
		let state: RouterState = {
			params,
			path,
			loading: true,
			initial,
			[NO_CHANGE]: true,
		} satisfies RouterState;
		let instance =
			route._layoutInstance ||
			((
				<route._layout routerState={state} />
			) as ComponentInstance<LayoutComponent>);
		route._layoutInstance = instance;
		let instanceState = instance.$.state;
		state.outlet = instanceState.routerState.outlet;
		instanceState.routerState = state;

		let dep: Promise<_MaybeShowEl>;

		if (ret?._layout) {
			dep = ret._dep.then((_) => ret._layout);
		} else if (ret?._el) {
			dep = ret._el;
		} else {
			dep = Promise.resolve(ret);
		}

		return {
			_layout: instance,
			_dep: dep.then((el) => {
				if (el) {
					state.outlet = el;
					state.loading = false;
					instanceState.routerState = state;
				}
			}),
		};
	}
	return ret;
};

type Disjoint<T1, T2> =
	| ({ [P in keyof T2]?: never } & { [P in keyof T1]: T1[P] })
	| ({ [P in keyof T1]?: never } & { [P in keyof T2]: T2[P] });
type ReconcileRet = Disjoint<
	{ _el: Promise<_MaybeShowEl> },
	{ _layout: ComponentInstance<LayoutComponent>; _dep: Promise<any> }
>;
let _reconcile = (
	_current: RouteInternal[],
	path: string,
	params: RouteParams,
	initial: boolean
): ReconcileRet | undefined => {
	let current = _current.pop();
	if (!current) return;

	let ret;
	if (current._show) {
		ret = {
			_el: getShow(current._showInstance, current._show, { ...params }).then(
				(x) => (current._showInstance = x)
			),
		};
	} else if (_current.length) {
		ret = _reconcile(_current, path, { ...params }, initial);
	} else {
		dev: {
			throw new Error(`Unable to navigate, route had no show target`);
		}
	}

	return _handleLayout(current, ret, path, params, initial);
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
			el?: ShowElement;
			_lastPath: RouteInternal[];

			route: (path?: string, origin?: string) => Promise<string | undefined>;
			navigate: (path: string) => Promise<string | undefined>;
			ssgables: () => [string, string][];
			[NO_CHANGE]: true;
		}
	>
) {
	this[NO_CHANGE] = true;

	// eslint-disable-next-line @typescript-eslint/no-this-alias
	router = this;

	let routes = { _children: this.children as any as RouteInternal[] };
	let routing = false;
	dev: {
		validateRoute(routes);
	}

	this._lastPath = [];

	this.route = async (path = location.pathname, origin = location.origin) => {
		if (routing) return;

		routing = true;
		let realPath = new URL(path, origin).pathname;
		if (realPath.endsWith(".html"))
			realPath = realPath.slice(0, realPath.length - 5);
		let segments = realPath.split("/").slice(1);
		let params = { [NO_CHANGE]: true } as const;
		let routePath = _route(routes, realPath, segments, params);
		let reconciled = _reconcile(
			[...routePath].reverse(),
			realPath,
			params,
			!this._lastPath.length
		);
		this._lastPath = routePath;

		if (reconciled?._el) this.el = await reconciled._el;
		else if (reconciled?._layout) {
			this.el = reconciled._layout;
			await reconciled._dep;
		} else {
			this.el = reconciled;
		}

		routing = false;
		if (this.el) return realPath;
	};
	this.navigate = async (path) => {
		let ret = await this.route(path);
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

	return <>{use(this.el)}</>;
}
