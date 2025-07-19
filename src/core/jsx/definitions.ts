import { CssInit } from "../css";
import { BasePointer, BoundPointer } from "../state/pointers";
import { Stateful } from "../state/state";

export type ComponentChild =
	| Node
	| string
	| number
	| boolean
	| null
	| undefined
	| ComponentChild[]
	| BasePointer<ComponentChild>;

export type ComponentContext<T> = {
	state: Stateful<T>;

	root: HTMLElement;

	children: ComponentChild[];

	id: string;

	mount?: () => void;
};

type MappedProps<Props> = {
	[Key in keyof Props]: Props[Key] | BasePointer<Props[Key]>;
};
export type Component<Props = {}, Private = {}, Public = {}> = {
	(
		this: Stateful<Props & Private & Public>,
		cx: ComponentContext<Props & Private & Public>
	): HTMLElement;
	style?: CssInit;
};
export type ComponentInstance<T extends Component<any, any, any>> =
	T extends Component<infer Props, infer Private, infer Public>
		? DLElement<Props & Private & Public>
		: never;
export type DLElement<T> = HTMLElement & { $: ComponentContext<T> };

type IntrinsicProps<ElementType extends Element> = {
	this?: BoundPointer<ElementType | Element | null | undefined>;
	children?: any;
	[key: `class:${string}`]: BasePointer<boolean>;
	[key: `on:${string}`]: (e: Event) => void;
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

export namespace JSX {
	export type IntrinsicElements = {
		[El in keyof DLElementTagNames]: IntrinsicProps<DLElementTagNames[El]>;
	} & {
		[element: string]: IntrinsicProps<GlobalElement>;
	};

	export type ElementType = keyof IntrinsicElements | Component<any, any, any>;
	export type Element = HTMLElement;
	export type LibraryManagedAttributes<C, _> =
		C extends Component<infer Props, any, any> ? MappedProps<Props> : never;
}
