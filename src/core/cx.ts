import { Component, ComponentContext } from "./jsx/definitions";

export let currentComponentCx:
	| ComponentContext<Component<any, any>>
	| undefined;

export type CxListener<T> = [
	callback: (value: T) => void,
	cx: ComponentContext<Component<any, any>> | undefined,
];

export let withCx = <A, B, R>(
	cx: ComponentContext<any> | undefined,
	fn: (this: B, arg: A) => R,
	arg?: A,
	self?: B
): R => {
	let old = currentComponentCx;
	currentComponentCx = cx;
	try {
		return fn.call(self!, arg!);
	} finally {
		currentComponentCx = old;
	}
};
