// the state system uses a getter on globalThis to "trap" all accesses to stateful properties
// the getter returns a function which when called will turn off the trap immediately and then return a DLPointer
// effectively the "trap" is only active during the time the js engine parses the argument list
//
// while the trap is active, stateful objects return a proxy that collects all accesses and coerces to a Symbol
// that Symbol is in an "internal pointers" list allowing `state[state.x]` to add a pointer to the path instead of a static value

import { DREAMLAND_INTERNAL } from "./consts";

let TOPRIMITIVE = Symbol.toPrimitive;

type ObjectProp = string | symbol;
type StateData = {
	_listeners: ((prop: ObjectProp, val: any) => void)[],
	_target: any,
	_proxy: any,
};

type PointerStep = ObjectProp | DLPointer<ObjectProp>;

enum PointerType {
	Regular,
	Dependent,
}

type PointerData = {
	_id: symbol,
	_listeners: ((val: any) => void)[],
} & ({
	_type: PointerType.Regular,
	_state: StateData,
	_path: PointerStep[],
} | {
	_type: PointerType.Dependent,
	_ptrs: DLPointer<any>[],
});

let useTrap = false;
let internalPointers: Map<symbol, PointerData> = new Map();

// once the path has been collected listeners are added to all state objects and pointers touched
// any changes to props that the pointer touches trigger a recalculate and notify all of the pointers' listeners
function initPtr(id: symbol) {
	let ptr = internalPointers.get(id);

	if (ptr._type !== PointerType.Regular) throw "";

	let recalculate = (idx: number, val: any) => {
		let obj = ptr._state._target;
		for (let [i, step] of ptr._path.map((x, i) => [i, x] as const)) {
			if (i === idx) {
				obj = obj[val];
			} else {
				let resolved = step instanceof DLPointer ? step.value : step;
				obj = obj[resolved];
			}
		}

		for (let listener of ptr._listeners) {
			listener(obj);
		}
	};

	for (let [i, step] of ptr._path.map((x, i) => [i, x] as const)) {
		if (step instanceof DLPointer) {
			step.listen((val) => recalculate(i, val));
		} else {
			ptr._state._listeners.push((prop, val) => {
				if (prop === step) {
					recalculate(i, val);
				}
			});
		}
	}
}

Object.defineProperty(globalThis, "use", {
	get: () => {
		useTrap = true;
		return (magicPtr: { [Symbol.toPrimitive]: () => symbol }) => {
			useTrap = false;

			let id = magicPtr[TOPRIMITIVE]();
			if (!internalPointers.has(id)) {
				throw "use() requires a value from a stateful context";
			}

			initPtr(id);

			return new DLPointer(id);
		};
	}
});

export function $state(obj: Object) {
	if (!(obj instanceof Object)) {
		throw "$state requires object";
	}

	let state: StateData = {
		_listeners: [],
		_target: obj,
		_proxy: null!,
	};

	let proxy = new Proxy(obj, {
		get(target, prop, proxy) {
			if (useTrap) {
				let step: PointerStep = prop;
				if (typeof prop === "symbol" && internalPointers.has(prop)) {
					initPtr(prop);
					step = new DLPointer(prop);
				}

				let ptr: PointerData = {
					_type: PointerType.Regular,
					_state: state,
					_id: Symbol(),
					_path: [step],
					_listeners: [],
				};
				internalPointers.set(ptr._id, ptr);

				// this proxy collects all the accesses in this pointer instance and adds them to the path
				return new Proxy({}, {
					get(_target, prop, proxy) {
						if (prop === TOPRIMITIVE) return () => ptr._id;

						let step: PointerStep = prop;
						if (typeof prop === "symbol" && internalPointers.has(prop)) {
							initPtr(prop);
							step = new DLPointer(prop);
						}
						ptr._path.push(step);

						return proxy;
					},
				});
			}
			if (prop == DREAMLAND_INTERNAL) return state;
			return Reflect.get(target, prop, proxy);
		},
		set(target, prop, newValue, proxy) {
			for (let listener of state._listeners) {
				listener(prop, newValue);
			}
			return Reflect.set(target, prop, newValue, proxy);
		},
	});

	state._proxy = proxy;

	return proxy;
}

export abstract class DLBasePointer<T> {
	_ptr: PointerData;
	_mapping?: (val: any) => any;
	_reverse?: (val: any) => any;
	abstract readonly bound: boolean;

	constructor(sym: symbol, mapping?: (val: any) => any, reverse?: (val: any) => any) {
		if (!internalPointers.has(sym)) {
			throw "Illegal invocation";
		}
		this._ptr = internalPointers.get(sym);
		this._mapping = mapping;
		this._reverse = reverse;
	}

	get value(): T {
		const ptr = this._ptr;
		if (ptr._type === PointerType.Regular) {
			let obj = ptr._state._target;
			for (let step of ptr._path) {
				let resolved = step instanceof DLPointer ? step.value : step;
				obj = obj[resolved];
			}
			return this._mapping ? this._mapping(obj) : obj;
		} else {
			return ptr._ptrs.map(x => x.value) as T;
		}
	}

	[TOPRIMITIVE]() {
		return this._ptr._id;
	}

	listen(func: (val: T) => void) {
		this._ptr._listeners.push(func);
	}

	$then(func: () => void) {
		this.listen(val => { if (!!val) func() });
	}
	$else(func: () => void) {
		this.listen(val => { if (!val) func() });
	}

	zip(...other: DLPointer<any>[]): DLPointer<any[]> {
		let ptr: PointerData = {
			_type: PointerType.Dependent,
			_id: Symbol(),
			_listeners: [],
			_ptrs: [new DLPointer(this._ptr._id), ...other],
		};

		for (const [i, other] of ptr._ptrs.map((x, i) => [i, x] as const)) {
			other.listen((val) => {
				const zipped = ptr._ptrs.map((x, j) => i === j ? val : x.value);
				for (const listener of ptr._listeners) {
					listener(zipped);
				}
			});
		}

		internalPointers.set(ptr._id, ptr);

		return new DLPointer(ptr._id);
	}
}

export class DLPointer<T> extends DLBasePointer<T> {
	readonly bound: false = false;

	bind() {
		if (this._ptr._type === PointerType.Regular) {
			return new DLBoundPointer(this._ptr._id);
		} else {
			throw "zipped pointers cannot be bound";
		}
	}

	clone(): DLPointer<T> {
		return new DLPointer(this._ptr._id);
	}

	map<U>(func: (val: T) => U): DLPointer<U> {
		const mapper = this._mapping ? (val: any) => func(this._mapping(val)) : func;
		return new DLPointer(this._ptr._id, mapper);
	}
}
export class DLBoundPointer<T> extends DLBasePointer<T> {
	readonly bound: true = true;

	set value(val: T) {
		if (this._ptr._type === PointerType.Regular) {
			val = this._reverse ? this._reverse(val) : val;

			let obj = this._ptr._state._proxy;
			for (let step of this._ptr._path.slice(0, -1)) {
				let resolved = step instanceof DLPointer ? step.value : step;
				obj = obj[resolved];
			}
			let step = this._ptr._path.at(-1);
			let resolved = step instanceof DLPointer ? step.value : step;
			obj[resolved] = val;
		}
	}

	clone(): DLBoundPointer<T> {
		return new DLBoundPointer(this._ptr._id);
	}

	map<U>(func: (val: T) => U, reverse?: (val: U) => T) {
		const forwards = this._mapping ? (val: any) => func(this._mapping(val)) : func;
		if (reverse) {
			const mapper = this._reverse ? (val: any) => this._reverse(reverse(val)) : func;
			return new DLBoundPointer(this._ptr._id, forwards, mapper);
		} else {
			return new DLPointer(this._ptr._id, forwards);
		}
	}
}
