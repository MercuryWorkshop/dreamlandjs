import { callDelegateListeners, currentCssIdent } from "./jsx/index";

export interface DelegateListener<T> {
	_callback: (value: T) => void;
	_cssIdent: string | null;
}

export type Delegate<T> = {
	listen: (callback: (value: T) => void) => void;
	(value: T): void;
};

export let createDelegate = <T>(): Delegate<T> => {
	let listeners: DelegateListener<T>[] = [];

	let delegate = ((value: T) =>
		callDelegateListeners(value, listeners)) as Delegate<T>;

	delegate.listen = (_callback: (value: T) => void) => {
		listeners.push({
			_callback,
			_cssIdent: currentCssIdent,
		});
	};

	return delegate;
};
