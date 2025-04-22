import { Component, VNode } from "./vdom";

declare global {
	namespace JSX {
		export type IntrinsicElements = {
			[index: string]: any;
		};

		export type ElementType =
			| keyof IntrinsicElements
			| Component<any, any, any>;
		export type Element = VNode;
		export type LibraryManagedAttributes<C, _> =
			C extends Component<infer Props, any, any> ? Props : never;
	}
}
