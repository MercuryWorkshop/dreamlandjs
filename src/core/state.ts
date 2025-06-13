// the state system uses a getter on globalThis to "trap" all accesses to stateful properties
// the getter returns a function which when called will turn off the trap immediately and then return a DLPointer
// effectively the "trap" is only active during the time the js engine parses the argument list
//
// while the trap is active, stateful objects return a proxy that collects all accesses and coerces to a Symbol
// that Symbol is in an "internal pointers" list allowing `state[state.x]` to add a pointer to the path instead of a static value

import { DREAMLAND, STATEFUL } from "./consts";

let TOPRIMITIVE = Symbol.toPrimitive;

type ObjectProp = string | symbol;
type StateData = {
	_id: symbol;
	_listeners: ((prop: ObjectProp, val: any) => void)[];
	_target: any;
	_proxy: any;
};

type PointerStep = ObjectProp | DLPointer<ObjectProp>;

const enum PointerType {
	Regular,
	Dependent,
}

type PointerData = {
	_id: symbol;
	_listeners: ((val: any) => void)[];
} & (
	| {
			_type: PointerType.Regular;
			_state: StateData;
			_path: PointerStep[];
	  }
	| {
			_type: PointerType.Dependent;
			_ptrs: DLBasePointer<any>[];
	  }
);

let useTrap = false;
let internalPointers: Map<symbol, PointerData> = new Map();
let internalStateful: Map<symbol, StateData> = new Map();

// once the path has been collected listeners are added to all state objects and pointers touched
// any changes to props that the pointer touches trigger a recalculate and notify all of the pointers' listeners
let initPtr = (id: symbol) => {
	let ptr = internalPointers.get(id);

	dev: {
		if (ptr._type !== PointerType.Regular) throw "Illegal invocation";
	}

	let recalculate = (idx: number, val: any) => {
		let obj = ptr._state._target;
		for (let [i, step] of ptr._path.map((x, i) => [i, x] as const)) {
			if (i === idx) {
				obj = val;
			} else {
				let resolved = isBasePtr(step) ? step.value : step;
				obj = obj[resolved];
			}
		}

		for (let listener of ptr._listeners) {
			listener(obj);
		}
	};

	for (let [i, step] of ptr._path.map((x, i) => [i, x] as const)) {
		if (isBasePtr(step)) {
			step.listen((val) => recalculate(i, val));
		} else {
			ptr._state._listeners.push((prop, val) => {
				if (prop === step) {
					recalculate(i, val);
				}
			});
		}
	}
};

let usestr = (template: TemplateStringsArray, params: any[]) => {
	let state = createState({}) as Stateful<{ _string: string }>;
	let flattened = [];
	for (let i in template) {
		flattened.push(template[i]);
		if (params[i]) {
			let val = params[i];
			let id = val[TOPRIMITIVE]();
			let prop: any;

			if (internalPointers.has(id)) {
				initPtr(id);
				prop = new DLPointer(id);
			} else {
				prop = val;
			}

			if (isBasePtr(prop)) {
				let i = flattened.length;
				prop.listen((val) => {
					flattened[i] = val;
					state._string = flattened.join("");
				});
				flattened.push("" + prop.value);
			} else {
				flattened.push("" + prop);
			}
		}
	}

	state._string = flattened.join("");

	return use(state._string);
};

Object.defineProperty(globalThis, "use", {
	get() {
		useTrap = true;
		return (
			magicPtr: { [Symbol.toPrimitive]: () => symbol } | TemplateStringsArray,
			...params: any[]
		) => {
			useTrap = false;

			usestr: {
				if (magicPtr instanceof Array && "raw" in magicPtr)
					return usestr(magicPtr, params);
			}

			let id = magicPtr[TOPRIMITIVE]();
			dev: {
				if (isBasePtr(magicPtr) || !internalPointers.has(id))
					throw "Illegal invocation";
			}

			initPtr(id);

			return new DLPointer(id);
		};
	},
});

declare global {
	function use<T>(stateful: T): DLPointer<T>;
	/* USESTR.START */
	function use(
		template: TemplateStringsArray,
		...params: any[]
	): DLPointer<string>;
	/* USESTR.END */
}

type StatefulObject = Record<string | symbol, any>;
export type Stateful<T extends StatefulObject> = T & {
	[DREAMLAND]: typeof STATEFUL;
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
			if (useTrap) {
				if (prop === DREAMLAND) return state._id;

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
				return new Proxy(
					{},
					{
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
					}
				);
			}
			if (prop === DREAMLAND) return STATEFUL;
			return Reflect.get(target, prop, proxy);
		},
		set(target, prop, newValue, proxy) {
			let ret = Reflect.set(target, prop, newValue, proxy);
			for (let listener of state._listeners) {
				listener(prop, newValue);
			}
			return ret;
		},
	});

	state._proxy = proxy;

	return proxy as Stateful<T>;
};

let getStatefulInner = (state: Stateful<any>): StateData => {
	useTrap = true;
	let id = state[DREAMLAND];
	useTrap = false;
	return internalStateful.get(id);
};
export let stateListen = <T extends StatefulObject>(
	state: Stateful<T>,
	func: (prop: string | symbol, newValue: any) => void
) => {
	getStatefulInner(state)._listeners.push(func);
};
export let stateProxy = <T extends StatefulObject, Key extends string | symbol>(
	state: Stateful<T>,
	key: Key,
	pointer: DLBasePointer<T[Key]>
) => {
	let inner = getStatefulInner(state);
	inner._target[key] = pointer.value;
	let setting = false;
	pointer.listen((x) => {
		setting = true;
		inner._proxy[key] = x;
	});
	inner._listeners.push((prop, val) => {
		if (setting) {
			setting = false;
			return;
		}
		if (pointer instanceof DLBoundPointer && prop === key) pointer.value = val;
	});
};

export let isBasePtr = (val: any): val is DLBasePointer<any> => {
	return val instanceof DLBasePointer;
};
export let isBoundPtr = (val: any): val is DLBoundPointer<any> => {
	return isBasePtr(val) && val.bound;
};
export let isStateful = (val: any): val is Stateful<any> => {
	return typeof val === "object" && val !== null && val[DREAMLAND] === STATEFUL;
};

export abstract class DLBasePointer<T> {
	// @internal
	_ptr: PointerData;
	// @internal
	_mapping?: (val: any) => any;
	// @internal
	_reverse?: (val: any) => any;

	// @internal
	_cssIdent?: string;

	abstract readonly bound: boolean;

	// @internal
	constructor(
		sym: symbol,
		mapping?: (val: any) => any,
		reverse?: (val: any) => any
	) {
		dev: {
			if (!internalPointers.has(sym)) {
				throw "Illegal invocation";
			}
		}
		this._ptr = internalPointers.get(sym);
		this._mapping = mapping;
		this._reverse = reverse;
	}

	get value(): T {
		let ptr = this._ptr;
		let obj;
		if (ptr._type === PointerType.Regular) {
			obj = ptr._state._target;
			for (let step of ptr._path) {
				let resolved = isBasePtr(step) ? step.value : step;
				obj = obj[resolved];
			}
		} else {
			obj = ptr._ptrs.map((x) => x.value) as T;
		}
		return this._mapping ? this._mapping(obj) : obj;
	}

	[TOPRIMITIVE as typeof Symbol.toPrimitive]() {
		return this._ptr._id;
	}

	listen(func: (val: T) => void) {
		this._ptr._listeners.push(
			this._mapping ? (x) => func(this._mapping(x)) : func
		);
	}

	andThen<True, False>(
		then: True,
		otherwise?: False
	): DLPointer<
		| (True extends (val: T) => infer TR ? TR : True)
		| (False extends (val: T) => infer FR ? FR : False)
	> {
		return this.map((val) => {
			let real = val ? then : otherwise;
			// typescript is an idiot
			return typeof real === "function" ? (real as (val: T) => any)(val) : real;
		});
	}
	map<U>(func: (val: T) => U): DLPointer<U> {
		let mapper = this._mapping ? (val: any) => func(this._mapping(val)) : func;
		return new DLPointer(this._ptr._id, mapper);
	}
	zip<Ptrs extends ReadonlyArray<DLBasePointer<any>>>(
		...pointers: Ptrs
	): DLPointer<
		[
			T,
			...{
				[Idx in keyof Ptrs]: Ptrs[Idx] extends DLBasePointer<infer Val>
					? Val
					: never;
			},
		]
	> {
		let ptr: PointerData = {
			_type: PointerType.Dependent,
			_id: Symbol(),
			_listeners: [],
			_ptrs: [new DLPointer(this._ptr._id, this._mapping), ...pointers],
		};

		for (let [i, other] of ptr._ptrs.map((x, i) => [i, x] as const)) {
			other.listen((val) => {
				let zipped = ptr._ptrs.map((x, j) => (i === j ? val : x.value));
				for (let listener of ptr._listeners) {
					listener(zipped);
				}
			});
		}

		internalPointers.set(ptr._id, ptr);

		return new DLPointer(ptr._id);
	}

	mapEach<U, R>(
		this: DLBasePointer<ArrayLike<U>>,
		func: (val: U, i: number) => R
	): DLPointer<R[]> {
		return this.map((x) => Array.from(x).map(func));
	}
}

export class DLPointer<T> extends DLBasePointer<T> {
	readonly bound: false = false;

	bind(): DLBoundPointer<T> {
		if (this._ptr._type === PointerType.Regular) {
			return new DLBoundPointer(this._ptr._id);
		} else {
			dev: {
				throw "Illegal invocation";
			}
		}
	}

	clone(): DLPointer<T> {
		return new DLPointer(this._ptr._id, this._mapping);
	}
}
export class DLBoundPointer<T> extends DLBasePointer<T> {
	readonly bound: true = true;

	get value(): T {
		return super.value;
	}
	set value(val: T) {
		if (this._ptr._type === PointerType.Regular) {
			val = this._reverse ? this._reverse(val) : val;

			let obj = this._ptr._state._proxy;
			let path = this._ptr._path;
			for (let step of path.slice(0, -1)) {
				let resolved = isBasePtr(step) ? step.value : step;
				obj = obj[resolved];
			}
			let step = path.at(-1);
			let resolved = isBasePtr(step) ? step.value : step;
			obj[resolved] = val;
		}
	}

	clone(): DLBoundPointer<T> {
		return new DLBoundPointer(this._ptr._id, this._mapping, this._reverse);
	}

	map<U>(func: (val: T) => U): DLPointer<U>;
	map<U>(func: (val: T) => U, reverse: (val: U) => T): DLBoundPointer<U>;
	map<U>(func: (val: T) => U, reverse?: (val: U) => T) {
		let forwards = this._mapping
			? (val: any) => func(this._mapping(val))
			: func;
		if (reverse) {
			let mapper = this._reverse
				? (val: any) => this._reverse(reverse(val))
				: reverse;
			return new DLBoundPointer(this._ptr._id, forwards, mapper);
		} else {
			return new DLPointer(this._ptr._id, forwards);
		}
	}
}
