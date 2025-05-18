import { DLBasePointer, DLBoundPointer, Stateful } from "../state";
import { DLCSS } from "../css";

export type ComponentChild =
	| Node
	| string
	| number
	| boolean
	| null
	| undefined
	| ComponentChild[]
	| DLBasePointer<ComponentChild>;

export type ComponentContext<T> = {
	state: Stateful<T>;

	root: HTMLElement;

	css?: DLCSS;

	mount?: () => void;
};

type ProxiedProps<Props> = {
	[Key in keyof Props]: Props[Key] extends DLBasePointer<infer Pointed>
		? Pointed
		: Props[Key];
};
export type Component<Props = {}, Private = {}, Public = {}> = (
	this: Stateful<ProxiedProps<Props> & Private & Public>,
	cx: ComponentContext<ProxiedProps<Props> & Private & Public>
) => HTMLElement;
export type ComponentInstance<T extends Component> =
	T extends Component<infer Props, infer Private, infer Public>
		? DLElement<ProxiedProps<Props> & Private & Public>
		: never;
export type DLElement<T> = HTMLElement & { $: ComponentContext<T> };

type OnEventMap<T> = {
	[K in keyof T as K extends string ? `on:${K}` : never]?: (
		event: T[K]
	) => void;
};
type IntrinsicProps<ElementType extends Element> =
	| OnEventMap<
			ElementType["addEventListener"] extends (name: infer Events) => void
				? Events
				: never
	  >
	| {
			this?: DLBoundPointer<ElementType | Element | null | undefined>;
			children?: any;
			[key: `class:${string}`]: DLBasePointer<boolean>;
			[key: `on:${string}`]: (event: Event) => void;
			[key: string]: any;
	  };
type ElementTagNames = HTMLElementTagNameMap &
	HTMLElementDeprecatedTagNameMap &
	Pick<
		SVGElementTagNameMap,
		Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>
	>;
type GlobalElement = Element;

declare global {
	namespace JSX {
		export type IntrinsicElements = {
			[El in keyof ElementTagNames]: IntrinsicProps<ElementTagNames[El]>;
		} & {
			[element: string]: IntrinsicProps<GlobalElement>;
		};

		export type ElementType =
			| keyof IntrinsicElements
			| Component<any, any, any>;
		export type Element = HTMLElement;
		export type LibraryManagedAttributes<C, _> =
			C extends Component<infer Props, any, any> ? Props : never;
	}
}
