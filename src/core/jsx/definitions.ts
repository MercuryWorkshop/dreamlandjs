import { CssInit } from "../css";
import { Pointer } from "../state/pointers";
import { Stateful } from "../state/state";
import { DREAMLAND, NO_CHANGE } from "../consts";

export type ComponentChild =
	| Node
	| string
	| number
	| boolean
	| null
	| undefined
	| ComponentChild[]
	| Pointer<ComponentChild>;

type BannedPropNames = "cx" | "root";
type BanProps<T extends object> = {
	[K in keyof T]: K extends BannedPropNames ? never : T[K];
};
type _StateProps<Combined extends BanProps<Combined>> = {
	[K in keyof Combined]: Combined[K];
} & { root: JSX.Element; cx: ComponentCx<_StateProps<Combined>> };
type StateProps<
	Props extends BanProps<Props>,
	This extends BanProps<This>,
> = _StateProps<Props & This>;
type ComponentStateProps<T extends Component<any, any>> =
	T extends Component<infer Props, infer This>
		? StateProps<Props, This>
		: never;

export type FC<
	Props extends BanProps<Props> = {},
	This extends BanProps<This> = {},
> = Stateful<StateProps<Props, This>>;

export type ComponentFn<
	Props extends BanProps<Props> = {},
	This extends BanProps<This> = {},
> = {
	["typescript hackfix"](this: FC<Props, This>): HTMLElement;
}["typescript hackfix"];
export type Component<
	Props extends BanProps<Props> = {},
	This extends BanProps<This> = {},
> = ComponentFn<Props, This> & { style?: CssInit };

type ComponentCx<StatefulProps extends { [DREAMLAND]?: never } & object> = {
	[NO_CHANGE]: any[];

	state: Stateful<StatefulProps>;
	id?: string;

	load?: () => Promise<any> | any;
	init?: () => Promise<any> | any;
	mount?: () => Promise<any> | any;
} & {
	[K in keyof DLComponentContextExtraProps]?: DLComponentContextExtraProps[K];
};

export type ComponentFnState<T extends Component<any, any>> =
	T extends ComponentFn<infer Props, infer This> ? FC<Props, This> : never;
export type ComponentState<T extends Component<any, any>> =
	T extends Component<infer Props, infer This> ? FC<Props, This> : never;
export type ComponentContext<T extends Component<any, any>> = ComponentCx<
	ComponentStateProps<T>
>;
export type ComponentInstance<T extends Component<any, any>> = HTMLElement & {
	$: ComponentContext<T>;
};

type IntrinsicProps<ElementType extends Element> = {
	this?: Pointer<ElementType | Element | null | undefined>;
	children?: any;
	[key: `class:${string}`]: Pointer<boolean> | boolean;
	[key: `on:${string}`]: (e: any) => void;
	[key: string]: any;
};

type DLElementTagNames = HTMLElementTagNameMap &
	HTMLElementDeprecatedTagNameMap &
	Pick<
		SVGElementTagNameMap,
		Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>
	>;
export type DLElementNameToElement<T extends string> =
	T extends keyof DLElementTagNames ? DLElementTagNames[T] : HTMLElement;
type GlobalElement = Element;

type MappedProps<Props> = {
	[Key in keyof Props]: Props[Key] | Pointer<Props[Key]>;
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
	export type IntrinsicElements = {
		[El in keyof DLElementTagNames]: IntrinsicProps<DLElementTagNames[El]>;
	} & {
		[element: string]: IntrinsicProps<GlobalElement>;
	};

	export type ElementType = keyof IntrinsicElements | Component<any, any>;
	export type Element = HTMLElement;
	export type LibraryManagedAttributes<C, _> =
		C extends Component<infer Props, any> ? MappedProps<Props> : never;
}

import DLJSX = JSX;

declare global {
	// we reserve the right to add new props to ComponentContext at any time without making it a breaking semver version, so be careful
	interface DLComponentContextExtraProps {}

	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace JSX {
		type IntrinsicElements = DLJSX.IntrinsicElements;
		type ElementType = DLJSX.ElementType;
		type Element = DLJSX.Element;
		type LibraryManagedAttributes<A, B> = DLJSX.LibraryManagedAttributes<A, B>;
	}
}
