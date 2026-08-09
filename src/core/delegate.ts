import { Component, ComponentContext } from "./jsx/definitions";
import { _createDelegate } from "./jsx/index";

export interface DelegateListener<T> {
	_callback: (value: T) => void;
	_cx?: ComponentContext<Component<any, any>>;
}

export type Delegate<T> = {
	listen: (callback: (value: T) => void) => void;
	(value: T): void;
};

export let createDelegate = _createDelegate;
