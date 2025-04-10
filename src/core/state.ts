// the state system uses a getter on globalThis to "trap" all accesses to stateful properties
// the getter returns a function which when called will turn off the trap immediately and then return a DLPointer
// effectively the "trap" is only active during the time the js engine parses the argument list
//
// while the trap is active, stateful objects return a proxy that collects all accesses and coerces to a Symbol
// that Symbol is in an "internal pointers" list allowing `state[state.x]` to add a pointer to the path instead of a static value

let TOPRIMITIVE = Symbol.toPrimitive;

type ObjectProp = string | symbol;
type StateData = {
	_listeners: ((prop: ObjectProp, val: any) => void)[],
	_target: any,
	_proxy: any,
};

type PointerStep = ObjectProp | DLPointer<ObjectProp>;
type PointerData = {
	_state: StateData,
	_path: PointerStep[],
	_id: symbol,
	_listeners: ((val: any) => void)[],
};

let useTrap = false;
let internalPointers: Map<symbol, PointerData> = new Map();

// once the path has been collected listeners are added to all state objects and pointers touched
// any changes to props that the pointer touches trigger a recalculate and notify all of the pointers' listeners
function initPtr(id: symbol) {
	let ptr = internalPointers.get(id);

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

abstract class DLBasePointer<T> {
	#ptr: PointerData;
	abstract bound: boolean;

	constructor(sym: symbol) {
		if (!internalPointers.has(sym)) {
			throw "Illegal invocation";
		}
		this.#ptr = internalPointers.get(sym);
	}

	get value(): T {
		let obj = this.#ptr._state._target;
		for (let step of this.#ptr._path) {
			let resolved = step instanceof DLPointer ? step.value : step;
			obj = obj[resolved];
		}
		return obj;
	}
	set value(val: T) {
		if (this.bound) {
			let obj = this.#ptr._state._proxy;
			for (let step of this.#ptr._path.slice(0, -1)) {
				let resolved = step instanceof DLPointer ? step.value : step;
				obj = obj[resolved];
			}
			let step = this.#ptr._path.at(-1);
			let resolved = step instanceof DLPointer ? step.value : step;
			obj[resolved] = val;
		}
	}

	[TOPRIMITIVE]() {
		return this.#ptr._id;
	}

	listen(func: (val: T) => void) {
		this.#ptr._listeners.push(func);
	}
}

export class DLPointer<T> extends DLBasePointer<T> {
	readonly bound: boolean = false;

	bind() {
		return new DLBoundPointer(this[TOPRIMITIVE]());
	}
}
export class DLBoundPointer<T> extends DLBasePointer<T> {
	readonly bound: boolean = true;
}
