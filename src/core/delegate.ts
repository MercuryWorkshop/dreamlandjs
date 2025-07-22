import { currentCssIdent, setCurrentCssIdent } from "./jsx/index";

export type Delegate<T> = {
	listen: (callback: (value: T) => void) => void;
	(value: T): void;
};

export function createDelegate<T>(): Delegate<T> {
	const listeners: Array<{
		_callback: (value: T) => void;
		_cssIdent: string | null;
	}> = [];

	const delegate = (value: T) => {
		for (const listener of listeners) {
			let oldIdent = currentCssIdent;
			setCurrentCssIdent(listener._cssIdent);
			listener._callback(value);
			setCurrentCssIdent(oldIdent);
		}
	};

	delegate.listen = (callback: (value: T) => void) => {
		listeners.push({
			_callback: callback,
			_cssIdent: currentCssIdent,
		});
	};

	return delegate;
}
