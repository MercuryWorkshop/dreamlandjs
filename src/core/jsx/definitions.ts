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

export class Component {
	css?: string;
	html: HTMLElement;

	init() {}
	mount() {}
	cx?: {};

	constructor(state: Stateful<any>) {
		return state;
	}
}
export type DLElement<T extends Component> = HTMLElement & { $: T };

type GlobalElement = Element;
type OnEventMap<T> = {
	[K in keyof T as K extends string ? `on:${K}` : never]?: (
		event: T[K]
	) => void;
};
type IntrinsicProps<ElementType extends GlobalElement> =
	| OnEventMap<
			ElementType["addEventListener"] extends (name: infer Events) => void
				? Events
				: never
	  >
	| {
			this?: BoundPointer<ElementType | GlobalElement | null | undefined>;
			children?: any;
			[key: `class:${string}`]: BasePointer<boolean>;
			[key: `on:${string}`]: (event: Event) => void;
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

type FilterProps<C> = {
	[K in keyof C as K extends `_${string}`
		? never
		: C[K] extends Function
			? K extends `on:${string}`
				? K
				: never
			: K]: C[K];
};
type MapProps<Props> = {
	[Key in keyof Props]: Props[Key] | BasePointer<Props[Key]>;
};

export namespace JSX {
	export type IntrinsicElements = {
		[El in keyof DLElementTagNames]: IntrinsicProps<DLElementTagNames[El]>;
	} & {
		[element: string]: IntrinsicProps<GlobalElement>;
	};

	export type Element = HTMLElement;
	export type ElementClass = Component;
	export type ElementType = keyof IntrinsicElements | (new () => ElementClass);

	export type LibraryManagedAttributes<C, _> = C extends new (
		...args: any
	) => ElementClass
		? MapProps<FilterProps<Omit<InstanceType<C>, keyof ElementClass>>>
		: never;
}
