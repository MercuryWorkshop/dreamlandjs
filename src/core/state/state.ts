import { COMMA_TOKEN, SYMBOL, TOPRIMITIVE } from "../consts";
import { ObjectProp } from "../utils";
import { InitializingPointer, Pointer } from "./pointers";
import { useTrap, useTrapMap } from "./use";

let internalStatefuls: WeakMap<
	Stateful<any>,
	InternalStateful<any>
> = new WeakMap();

export type StatefulListener = (prop: ObjectProp, state: Stateful<any>) => void;

interface InternalStateful<T> {
	_target: T;
	_listeners: StatefulListener[];
	_proxies: Record<ObjectProp, Pointer<any>>;
}

export type Stateful<T extends object> = T & {
	/// THIS IS A SEALED MARKER TYPE. do not try accessing it
	readonly [COMMA_TOKEN]: unique symbol;
};

let getInternal = <T extends object>(
	stateful: Stateful<T>
): InternalStateful<T> => internalStatefuls.get(stateful);
export let _stateListen = <T extends object>(
	stateful: Stateful<T>,
	listener: StatefulListener
) => {
	getInternal(stateful)._listeners.push(listener);
};
export let _stateListenRemove = <T extends object>(
	stateful: Stateful<T>,
	listener: StatefulListener
) => {
	let inner = getInternal(stateful);
	inner._listeners = inner._listeners.filter((x) => x !== listener);
};
export let _stateTarget = <T extends object>(stateful: Stateful<T>): T =>
	getInternal(stateful)._target;

export let createState = <T extends object>(target: T): Stateful<T> => {
	let internal: InternalStateful<T> = {
		_target: target,
		_listeners: [],
		_proxies: {},
	} satisfies InternalStateful<T>;

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
				: Reflect.get(target, p, receiver);
		},
		set(target, p, newValue, receiver) {
			let setRet = internal._proxies[p]
				? internal._proxies[p]._set(newValue)
				: Reflect.set(target, p, newValue, receiver);
			if (setRet) internal._listeners.map((x) => x(p, ret));
			// returning setRet would be better here but it would break a lot of strictmode code
			return true;
		},
	}) as Stateful<T>;
	internalStatefuls.set(ret, internal);
	return ret;
};

export let stateListen = <T extends object>(
	state: Stateful<T>,
	func: (newValue: any, prop: string | symbol) => void
) => {
	_stateListen(state, (prop, state) => func(state[prop], prop));
};

export let stateProxy = <T extends object, Key extends keyof T>(
	state: Stateful<T>,
	key: Key,
	ptr: Pointer<T[Key]>
) => {
	// `number` keys will get coerced to string anyway
	getInternal(state)._proxies[key as ObjectProp] = ptr;
	ptr.listen((val) =>
		getInternal(state)._listeners.map((x) => x(key as ObjectProp, val))
	);
};

export let isStateful = (val: any): val is Stateful<any> => !!getInternal(val);
