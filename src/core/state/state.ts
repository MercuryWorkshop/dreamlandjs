import { COMMA_TOKEN, WEAKMAP } from "../consts";
import { deref, ObjectProp } from "../utils";
import { InitializingPointer, Pointer } from "./pointers";
import { useTrap, useTrapMap } from "./use";
import { StateListenerNode, walkStateListeners } from "./util";

let internalStatefuls: WeakMap<Stateful<any>, InternalStateful> = WEAKMAP();

export type StatefulListener = (newValue: any, prop: ObjectProp) => void;

interface InternalStateful {
	_listeners: StatefulListener[];
	_pointers: Record<ObjectProp, StateListenerNode | undefined>;
	_proxies: Record<ObjectProp, Pointer<any>>;
}

export type Stateful<T extends object> = T & {
	/// THIS IS A SEALED MARKER TYPE. do not try accessing it
	readonly [COMMA_TOKEN]: unique symbol;
};

let getInternal = (stateful: Stateful<any>): InternalStateful =>
	internalStatefuls.get(stateful)!;
let callListeners = (
	internal: InternalStateful,
	prop: ObjectProp,
	newValue: any
) => {
	internal._listeners.forEach((x) => x(newValue, prop));
	walkStateListeners(
		(x) => deref(x._pointer),
		internal._pointers,
		prop
	).forEach((x) => deref(x._pointer)!._changed(x._index!));
};

export let _stateListen = <T extends object>(
	stateful: Stateful<T>,
	prop: ObjectProp,
	listener: WeakRef<Pointer<any>>,
	i: number
) => {
	let pointers = getInternal(stateful)._pointers;
	pointers[prop] = { _pointer: listener, _index: i, _next: pointers[prop] };
};
export let _stateListenRemove = <T extends object>(
	stateful: Stateful<T>,
	prop: ObjectProp,
	listener: WeakRef<Pointer<any>>,
	i: number
) => {
	walkStateListeners(
		(n) => !(listener === n._pointer && i === n._index),
		getInternal(stateful)._pointers,
		prop
	);
};

export interface StepCollector {
	_sym: symbol;
	_ptr: InitializingPointer;
	_proxy: any;
}

export let stepCollectors: StepCollector[] = [];

export let createState = <T extends object>(target: T): Stateful<T> => {
	let internal: InternalStateful = {
		_listeners: [],
		_pointers: {},
		_proxies: {},
	} satisfies InternalStateful;

	let ret = new Proxy(target, {
		get(target, p, receiver) {
			if (useTrap) {
				let sym = Symbol();
				let ptr: InitializingPointer = {
					_state: ret,
					_path: [p],
				} as any;
				let collector;
				if (!(collector = stepCollectors.pop())) {
					collector = {
						_proxy: new Proxy(
							{},
							{
								get(target, p, receiver) {
									if (p === Symbol.toPrimitive) return () => collector!._sym;
									collector!._ptr._path.push(p);
									return receiver;
								},
							}
						),
					} as any;
				}
				collector._sym = sym;
				collector._ptr = ptr;
				ptr._collector = collector;
				useTrapMap.set(sym, ptr);

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
				callListeners(internal, p, newValue);
			// returning setRet would be better here but it would break a lot of strictmode code
			return true;
		},
	}) as Stateful<T>;
	internalStatefuls.set(ret, internal);
	return ret;
};

export let stateListen = <T extends object>(
	state: Stateful<T>,
	func: StatefulListener
) => {
	getInternal(state)._listeners.push(func);
};

export let stateProxy = <T extends object, Key extends keyof T & ObjectProp>(
	state: Stateful<T>,
	key: Key,
	ptr: Pointer<T[Key]>
) => {
	// `number` keys will get coerced to string anyway
	getInternal(state)._proxies[key as ObjectProp] = ptr;
	ptr.listen((val) => callListeners(getInternal(state), key, val));
};

export let isStateful = (val: any): val is Stateful<any> => !!getInternal(val);
