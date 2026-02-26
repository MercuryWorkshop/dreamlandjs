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
	error?: any;
	loading: boolean;
	initial: boolean;
	[NO_CHANGE]: true;
}

export type LayoutComponent = Component<{ routerState: RouterState }>;

export type ShowElement =
	| ComponentInstance<Component<{}, { routerParams: RouteParams }>>
	| HTMLElement;
type _MaybePromiseShowEl = Promise<ShowElement> | ShowElement;
export type ShowTarget = _MaybePromiseShowEl | (() => _MaybePromiseShowEl);

export function Route(
	this: FC<{
		path?: string;
		show?: ShowTarget;
		layout?: LayoutComponent;
		cork?: boolean;
		children?: ComponentChild;
	}>
) {
	return {
		_path: this.path,
		_show: this.show,
		_layout: this.layout,
		_cork: this.cork,
		_children: this.children as any as RouteInternal[],
	} satisfies RouteInternal as any;
}

interface RouteInternal {
	_path?: string;
	_layout?: LayoutComponent;
	_layoutInstance?: ComponentInstance<LayoutComponent>;
	_cork?: boolean;
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

	if (!route._layout && route._cork) {
		throw new Error("Corked routing only works on a route with a layout");
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
			!route._children.length &&
			route._show
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

type Disjoint<T1, T2> =
	| ({ [P in keyof T2]?: never } & { [P in keyof T1]: T1[P] })
	| ({ [P in keyof T1]?: never } & { [P in keyof T2]: T2[P] });
type LayoutEl = ComponentInstance<LayoutComponent>;
type ReconcileRet = Disjoint<
	{ _el: Promise<ShowElement> },
	{ _layout: LayoutEl; _dep: Promise<LayoutEl> }
> & { _late: () => Promise<void> | void };
let _reconcile = (
	_current: RouteInternal[],
	path: string,
	params: RouteParams,
	initial: boolean
): ReconcileRet => {
	let current = _current.pop();
	dev: {
		if (!current) throw "unreachable";
	}
	let reconcile = () => {
		if (current._show) {
			ret = {
				_el: (async () => {
					let show = current._show!;
					let instance =
						current._showInstance ||
						(await (typeof show == "function" ? show() : show));

					if (isComponent(instance)) instance.$.state.routerParams = params;
					current._showInstance = instance;
					return instance;
				})(),
				_late() {},
			};
		} else if (_current.length) {
			ret = _reconcile(_current, path, params, initial);
		} else {
			dev: {
				throw new Error(`Unable to navigate, route had no show target`);
			}
		}
	};

	let ret: ReconcileRet | undefined;
	if (!current._cork) reconcile();

	if (current._layout) {
		let state: RouterState = {
			params: { ...params },
			path,
			loading: true,
			initial,
			[NO_CHANGE]: true,
		} satisfies RouterState;
		let instance =
			current._layoutInstance ||
			((
				<current._layout routerState={state} />
			) as ComponentInstance<LayoutComponent>);
		let instanceState = instance.$.state;
		let finish = (ret: ReconcileRet) =>
			(ret._dep || ret._el)
				.then(
					(x) => (state.outlet = x),
					(x) => (state.error = x)
				)
				.finally((_: void) => {
					state.loading = false;
					instanceState.routerState = state;
				});

		current._layoutInstance = instance;
		state.outlet = instanceState.routerState.outlet;
		instance.$.state.routerState = state;

		return {
			_layout: instance,
			_dep: ret ? finish(ret).then((_) => instance) : (async () => instance)(),
			_late: ret
				? ret._late
				: async () => {
						reconcile();
						await ret!._late();
						await finish(ret!);
					},
		};
	}
	return ret!;
};

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

				this["on:click"]?.();

				router.navigate(this.href);
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
			initial?: [path: string, origin: string] | [path: string] | [];
			children: HTMLElement | HTMLElement[];
		},
		{
			el?: ShowElement;

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
	dev: {
		validateRoute(routes);
	}

	let latestNavId = 0;
	let route = async (
		initial: boolean,
		path = location.pathname,
		origin = location.origin
	) => {
		let currentNavId = ++latestNavId;
		let realPath = new URL(path, origin).pathname;
		if (realPath.endsWith(".html"))
			realPath = realPath.slice(0, realPath.length - 5);
		let segments = realPath.split("/").slice(1);
		let params = { [NO_CHANGE]: true } as const;
		let routePath = _route(routes, realPath, segments, params);

		if (!routePath.length) {
			throw new Error("Failed to route to " + path);
		}

		let reconciled = _reconcile(
			[...routePath].reverse(),
			realPath,
			params,
			initial
		);
		let el;

		if (reconciled?._el) el = await reconciled._el;
		else if (reconciled?._layout) {
			el = reconciled._layout;
			await reconciled._dep;
		}

		if (currentNavId !== latestNavId) return [];
		this.el = el;

		return [this.el && realPath, reconciled?._late] as const;
	};
	this.navigate = async (path) => {
		let [ret, late] = await route(false, path);
		await late?.();
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

	let late: () => Promise<void> | void;
	let ran: boolean | undefined;
	this.cx.init = () => {
		let [path, origin] = this.initial || [];
		return route(true, path, origin).then(([_, _late]) => {
			if (ran) return _late?.();
			else late = _late;
		});
	};

	this.cx.mount = () => {
		addEventListener("popstate", () => {
			route(false).then(([_, late]) => late?.());
		});
		let ret = late?.();
		ran = true;
		return ret;
	};

	return <>{use(this.el)}</>;
}
