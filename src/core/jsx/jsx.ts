import { Component } from "./vdom";

declare global {
	namespace JSX {
		export type IntrinsicElements = {
			[index: string]: any;
		};
		export type ElementType = string | Component;
	}
}
