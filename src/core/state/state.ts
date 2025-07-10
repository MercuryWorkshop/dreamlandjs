// the state system uses a getter on globalThis to "trap" all accesses to stateful properties
// the getter returns a function which when called will turn off the trap immediately and then return a DLPointer
// effectively the "trap" is only active during the time the js engine parses the argument list
//
// while the trap is active, stateful objects return a proxy that collects all accesses and coerces to a Symbol
// that Symbol is in an "internal pointers" list allowing `state[state.x]` to add a pointer to the path instead of a static value

import { setUseTrap, useTrap } from ".";
import { DREAMLAND, STATEFUL, TOPRIMITIVE } from "../consts";
import {
	BasePointer,
	BoundPointer,
	initRegularPtr,
	Pointer,
	PointerData,
	PointerStep,
	PointerType,
	registerPointer,
} from "./pointers";

export type ObjectProp = string | symbol;
export type StateData = {
	_id: symbol;
	_listeners: ((prop: ObjectProp) => void)[];
	_target: any;
	_proxy: any;
};

let internalStateful: Map<symbol, StateData> = new Map();

type StatefulObject = Record<string | symbol, any>;
export type Stateful<T extends StatefulObject> = T & {
	[DREAMLAND]: typeof STATEFUL;
};

let mapStateStep = (step: any): PointerStep => {
	return typeof step === "symbol" && initRegularPtr(step)
		? new Pointer(step)
		: step;
};

export let createState = <T extends StatefulObject>(obj: T): Stateful<T> => {
	dev: {
		if (!(obj instanceof Object)) {
			throw "$state requires an object";
		}
	}

	let data: Omit<StateData, "_proxy"> = {
		_listeners: [],
		_target: obj,
		_id: Symbol(),
	};
	let state = data as StateData;
	internalStateful.set(state._id, state);

	let proxy = new Proxy(obj, {
		get(target, prop, proxy) {
			if (prop == DREAMLAND) return useTrap ? state._id : STATEFUL;
			if (useTrap) {
				let ptr: PointerData = registerPointer({
					_type: PointerType.Regular,
					_state: state,
					_id: Symbol(),
					_path: [mapStateStep(prop)],
					_listeners: [],
				});

				// this proxy collects all the accesses in this pointer instance and adds them to the path
				return new Proxy(
					{},
					{
						get(_target, prop, proxy) {
							if (prop == TOPRIMITIVE) return () => ptr._id;

							ptr._path.push(mapStateStep(prop));

							return proxy;
						},
					}
				);
			}

			return Reflect.get(target, prop, proxy);
		},
		set(target, prop, newValue, proxy) {
			let ret = Reflect.set(target, prop, newValue, proxy);
			for (let listener of state._listeners) {
				listener(prop);
			}
			return ret;
		},
	});

	state._proxy = proxy;

	return proxy as Stateful<T>;
};

export let getStatefulInner = (state: Stateful<any>): StateData => {
	/*@__INLINE__*/ setUseTrap(true);
	let id = state[DREAMLAND];
	/*@__INLINE__*/ setUseTrap(false);

	return internalStateful.get(id);
};
export let stateListen = <T extends StatefulObject>(
	state: Stateful<T>,
	func: (newValue: any, prop: string | symbol) => void
) => {
	getStatefulInner(state)._listeners.push((prop) => func(state[prop], prop));
};
export let stateProxy = <T extends StatefulObject, Key extends string | symbol>(
	state: Stateful<T>,
	key: Key,
	pointer: BasePointer<T[Key]>
) => {
	let inner = getStatefulInner(state);
	inner._target[key] = pointer.value;

	let setting = false;
	pointer.listen((x) => {
		setting = true;
		inner._proxy[key] = x;
	});
	inner._listeners.push((prop) => {
		if (prop !== key) return;

		if (setting) {
			setting = false;
			return;
		}
		if (pointer instanceof BoundPointer) pointer.value = state[prop];
	});
};

export let isStateful = (val: any): val is Stateful<any> => {
	return typeof val === "object" && val !== null && val[DREAMLAND] == STATEFUL;
};
