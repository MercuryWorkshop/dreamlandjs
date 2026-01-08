import { COMMA_TOKEN, REFLECT, SYMBOL, TOPRIMITIVE, WEAKMAP } from "../consts";
import { deref, ObjectProp } from "../utils";
import { InitializingPointer, Pointer } from "./pointers";
import { useTrap, useTrapMap } from "./use";

let internalStatefuls: WeakMap<Stateful<any>, InternalStateful> = WEAKMAP();

export type StatefulListener = (newValue: any, prop: ObjectProp) => void;

interface InternalStateful {
	_listeners: StatefulListener[];
	_weaks: WeakRef<StatefulListener>[];
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
	internal._listeners.map((x) => x(newValue, prop));
	(internal._weaks = internal._weaks.filter(deref)).map((x) =>
		deref(x)!(newValue, prop)
	);
};

export let _stateListen = <T extends object>(
	stateful: Stateful<T>,
	listener: WeakRef<StatefulListener>
) => {
	getInternal(stateful)._weaks.push(listener);
};
export let _stateListenRemove = <T extends object>(
	stateful: Stateful<T>,
	listener: WeakRef<StatefulListener>
) => {
	getInternal(stateful)._weaks = getInternal(stateful)._weaks.filter(
		(x) => x !== listener
	);
};

export let createState = <T extends object>(target: T): Stateful<T> => {
	let internal: InternalStateful = {
		_listeners: [],
		_weaks: [],
		_proxies: {},
	} satisfies InternalStateful;

	let ret = new Proxy(target, {
		get(target, p, receiver) {
			if (useTrap) {
				let sym = SYMBOL();
				let ptr: InitializingPointer = {
					_state: ret,
					_path: [p],
				} satisfies InitializingPointer;
				useTrapMap.set(sym, ptr);

				return new Proxy(
					{},
					{
						get(target, p, receiver) {
							if (p === TOPRIMITIVE) return () => sym;
							ptr._path.push(p);
							return receiver;
						},
					}
				);
			}

			return internal._proxies[p]
				? internal._proxies[p].value
				: REFLECT.get(target, p, receiver);
		},
		set(target, p, newValue, receiver) {
			let setRet = internal._proxies[p]
				? internal._proxies[p]._set(newValue)
				: REFLECT.set(target, p, newValue, receiver);
			if (setRet) callListeners(internal, p, newValue);
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
