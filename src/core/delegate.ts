import { currentComponentCx, CxListener, withCx } from "./cx";

export type Delegate<T> = {
	listen: (callback: (value: T) => void) => void;
	(value: T): void;
};

export let createDelegate = <T>(): Delegate<T> => {
	let listeners: CxListener<T>[] = [];

	let delegate = ((value: T): void =>
		listeners.forEach(([a, b]) => withCx(b, a, value))) as Delegate<T>;
	delegate.listen = (_callback) =>
		listeners.push([_callback, currentComponentCx]);

	return delegate;
};
