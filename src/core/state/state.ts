import { DREAMLAND } from "../consts";
import { ObjectProp } from "../utils";
import { InitializingPointer, Pointer } from "./pointers";
import { useTrap, useTrapMap } from "./use";
import { StateListenerNode, walkStateListeners } from "./util";

export type StatefulListener = (newValue: any, prop: ObjectProp) => void;

export interface InternalStateful {
	_listeners: StatefulListener[];
	_pointers: Record<
		ObjectProp,
		StateListenerNode<Pointer<any>, number> | undefined
	>;
	_proxies: Record<ObjectProp, Pointer<any>>;
	_weak: WeakRef<InternalStateful>;
}

/// THIS IS A SEALED MARKER TYPE. do not try accessing it
interface StatefulMarker {
	readonly [DREAMLAND]: unique symbol;
}
// @internal
interface StatefulMarker extends InternalStateful {}

export type Stateful<T extends object> = T & {
	readonly [DREAMLAND]: StatefulMarker;
};

export let _callStateListeners = (
	internal: InternalStateful,
	prop: ObjectProp,
	newValue: any
) => {
	internal._listeners.forEach((x) => x(newValue, prop));
	walkStateListeners(
		(ptr, index) => ptr._changed(index),
		internal._pointers,
		prop
	);
};

export let _stateListen = <T extends object>(
	stateful: Stateful<T>,
	prop: ObjectProp,
	listener: WeakRef<Pointer<any>>,
	i: number
) => {
	let pointers = stateful[DREAMLAND]._pointers;
	pointers[prop] = { _value: listener, _index: i, _next: pointers[prop] };
};
export let _stateListenRemove = <T extends object>(
	stateful: Stateful<T>,
	prop: ObjectProp,
	listener: Pointer<any>,
	i: number
) =>
	walkStateListeners(
		(ptr, index) => ptr === listener && index === i,
		stateful[DREAMLAND]._pointers,
		prop
	);

export interface StepCollector {
	_sym: symbol;
	_ptr: InitializingPointer;
	_proxy: any;
}

export let stepCollectors: StepCollector[] = [];

// do not close over anything otherwise it'll keep stuff alive
let stepCollectorHandler: ProxyHandler<StepCollector> = {
	get(collector, p, receiver) {
		if (p === Symbol.toPrimitive) return () => collector._sym;
		collector._ptr._path.push(p as ObjectProp);
		return receiver;
	},
};

export let createState = <T extends object>(target: T): Stateful<T> => {
	let internal: InternalStateful = {
		_listeners: [],
		_pointers: {},
		_proxies: {},
	} satisfies Omit<InternalStateful, "_weak"> as any as InternalStateful;
	let ret = new Proxy(target, {
		get(target, p, receiver) {
			if (p === DREAMLAND) return internal;

			if (useTrap) {
				let _sym = Symbol();
				let _ptr: InitializingPointer = {
					_state: ret,
					_path: [p],
				} as any;
				let collector = stepCollectors.pop() || ({} as StepCollector);
				if (!collector._proxy) {
					collector._proxy = new Proxy(collector, stepCollectorHandler);
				}
				collector._sym = _sym;
				collector._ptr = _ptr;
				_ptr._collector = collector;
				useTrapMap.set(_sym, _ptr);

				return collector._proxy;
			}

			return internal._proxies[p]
				? internal._proxies[p].value
				: Reflect.get(target, p, receiver);
		},
		set(target, p, newValue, receiver) {
			let setRet = internal._proxies[p]
				? internal._proxies[p]._set(newValue)
				: Reflect.set(target, p, newValue, receiver);
			if (setRet && (internal._listeners.length || internal._pointers[p]))
				_callStateListeners(internal, p, newValue);
			// returning setRet would be better here but it would break a lot of strictmode code
			return true;
		},
	}) as Stateful<T>;

	internal._weak = new WeakRef(internal);
	return ret;
};

export let stateListen = <T extends object>(
	state: Stateful<T>,
	func: StatefulListener
) => {
	state[DREAMLAND]._listeners.push(func);
};

export let stateProxy = <T extends object, Key extends keyof T & ObjectProp>(
	state: Stateful<T>,
	key: Key,
	ptr: Pointer<T[Key]>
) => {
	// `number` keys will get coerced to string anyway
	state[DREAMLAND]._proxies[key as ObjectProp] = ptr;
	ptr.p = { _value: state[DREAMLAND]._weak, _index: key, _next: ptr.p };
};

export let isStateful = (val: any): val is Stateful<any> =>
	!!(val && val[DREAMLAND]);
