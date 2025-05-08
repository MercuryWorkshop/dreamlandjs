import { DLBasePointer, DLBoundPointer } from "../state";
import { Component } from "./dom";

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
			this?: DLBoundPointer<ElementType>;
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
