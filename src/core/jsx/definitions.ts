import { CssInit } from "../css";
import { Pointer } from "../state/pointers";
import { Stateful } from "../state/state";
import { COMMA_TOKEN } from "../consts";

export type ComponentChild =
	| Node
	| string
	| number
	| boolean
	| null
	| undefined
	| ComponentChild[]
	| Pointer<ComponentChild>;

type Empty = Record<string, never>;
type BannedPropNames = "cx" | "root";
type BanProps<T extends object> = {
	[K in keyof T]: K extends BannedPropNames ? never : T[K];
};
type MapChildren<ChildrenTy> =
	ChildrenTy extends Array<any> ? ChildrenTy : [ChildrenTy];

type _StateProps<Combined extends BanProps<Combined>> = {
	[K in keyof Combined]: K extends "children"
		? MapChildren<Combined[K]>
		: Combined[K];
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
	Props extends BanProps<Props> = Empty,
	This extends BanProps<This> = Empty,
> = Stateful<StateProps<Props, This>>;

export type Component<
	Props extends BanProps<Props> = Empty,
	This extends BanProps<This> = Empty,
> = {
	["typescript hackfix"](this: FC<Props, This>): HTMLElement;
}["typescript hackfix"] & { style?: CssInit };

interface ComponentCx<
	StatefulProps extends { [COMMA_TOKEN]?: never } & object,
> {
	state: Stateful<StatefulProps>;
	id?: string;

	// Run only on client
	mount?: () => void;
	// Run on client and server
	init?: () => void;
}

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
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace JSX {
		type IntrinsicElements = DLJSX.IntrinsicElements;
		type ElementType = DLJSX.ElementType;
		type Element = DLJSX.Element;
		type LibraryManagedAttributes<A, B> = DLJSX.LibraryManagedAttributes<A, B>;
	}
}
