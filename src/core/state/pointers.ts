import { getStatefulInner } from ".";
import { TOPRIMITIVE, NO_CHANGE, DREAMLAND, SYMBOL } from "../consts";
import { isStateful, ObjectProp, StateData } from "./state";

export const enum PointerType {
	// state + pointer step
	Regular,
	// zipped pointer
	Zipped,
	// mapped pointer
	Mapped,
}
export type PointerStep = ObjectProp | Pointer<ObjectProp>;
export type PointerData = {
	_id: symbol;
	_listeners: (() => void)[];
} & (
	| {
			_type: PointerType.Regular;
			_state: StateData;
			_path: PointerStep[];
	  }
	| {
			_type: PointerType.Zipped;
			_ptrs: Pointer<any>[];
	  }
	| {
			_type: PointerType.Mapped;
			_ptr: PointerData;

			_map: (val: any) => any;
			_reverse?: (val: any) => any | typeof NO_CHANGE;
	  }
);

let internalPointers: Map<symbol, PointerData> = new Map();

let followPath = (obj: any, path: PointerStep[]): any =>
	path.reduce((acc, x) => acc[unwrapValue(x)], obj);

let getPtrValue = (ptr: PointerData): any => {
	let obj: any;
	if (ptr._type == PointerType.Regular) {
		obj = followPath(ptr._state._target, ptr._path);
	} else if (ptr._type == PointerType.Zipped) {
		obj = ptr._ptrs.map((x) => x.value);
	} else if (ptr._type == PointerType.Mapped) {
		obj = ptr._map(getPtrValue(ptr._ptr));
	}
	return obj;
};
export let setPtrValue = (ptr: PointerData, value: any): boolean => {
	if (ptr._type == PointerType.Regular) {
		let path = ptr._path;
		followPath(ptr._state._proxy, path.slice(0, -1))[unwrapValue(path.at(-1))] =
			value;
		return true;
	} else if (ptr._type == PointerType.Mapped && ptr._reverse) {
		let val = ptr._reverse(value);
		if (val !== NO_CHANGE) return setPtrValue(ptr._ptr, val);
	}
	return false;
};

let callAllListeners = (ptr: PointerData) => {
	ptr._listeners.forEach((x) => x());
};

export let registerPointer = <T extends PointerData>(ptr: T): T => {
	internalPointers.set(ptr._id, ptr);
	return ptr;
};

interface PtrInitStep {
	_steps: PointerStep[];
	_listener: (prop: ObjectProp) => void;
	_state?: StateData;
}

// once the path has been collected listeners are added to all state objects and pointers touched
// any changes to props that the pointer touches trigger a recalculate and notify all of the pointers' listeners
export let initRegularPtr = (id: symbol): boolean => {
	let ptr = internalPointers.get(id);
	if (!ptr) return false;

	dev: {
		if (ptr._type != PointerType.Regular) throw "Illegal invocation";
	}

	let path = ptr._path;
	let target = ptr._state._target;
	let steps: PtrInitStep[];

	let recalculate = () =>
		steps.forEach((x, i) => {
			if (x._state)
				x._state._listeners = x._state._listeners.filter(
					(y) => y !== x._listener
				);

			let stateful = steps
				.slice(0, i)
				.map((x) => followPath(target, x._steps))
				.find(isStateful);
			x._state = stateful ? getStatefulInner(stateful) : ptr._state;

			x._state._listeners.push(x._listener);
		});

	steps = path.map((x, i) => {
		if (isBasePtr(x)) {
			x.listen(recalculate);
		}
		return {
			_steps: path.slice(0, i + 1),
			_listener: (prop) => {
				if (prop === unwrapValue(x)) {
					callAllListeners(ptr);
				}
			},
		};
	});

	recalculate();

	return true;
};

export let isBasePtr = (val: any): val is Pointer<any> => {
	return val instanceof Pointer;
};

export let unwrapValue = <T>(val: Pointer<T> | T): T =>
	isBasePtr(val) ? val.value : val;
export let maybeListen = <T>(
	val: Pointer<T> | T,
	func: (val: T) => void,
	pointer?: () => void
) => {
	if (isBasePtr(val)) {
		pointer?.();
		val.listen(func);
	}
	func(unwrapValue(val));
};

export class Pointer<T> {
	// @internal
	_ptr: PointerData;

	// @internal
	_cssIdent?: string;

	// @internal
	constructor(sym: symbol) {
		this._ptr = internalPointers.get(sym);
		dev: {
			if (!this._ptr) {
				throw "Illegal invocation";
			}
		}
	}

	get value(): T {
		return getPtrValue(this._ptr);
	}
	set value(val: T) {
		setPtrValue(this._ptr, val);
	}

	[DREAMLAND](): Pointer<any>[] | null {
		let ptr = this._ptr;
		if (ptr._type == PointerType.Zipped) {
			return ptr._ptrs;
		}
		return null;
	}
	[NO_CHANGE](val: any) {
		return setPtrValue(this._ptr, val);
	}

	[TOPRIMITIVE]() {
		return this._ptr._id;
	}

	// @internal
	_map(
		mapping: (val: any) => any,
		reverse?: (val: any) => any | typeof NO_CHANGE
	): symbol {
		let ptr: PointerData = registerPointer({
			_type: PointerType.Mapped,
			_id: SYMBOL(),
			_listeners: [],

			_map: mapping,
			_reverse: reverse,
			_ptr: this._ptr,
		});

		this.listen((_) => callAllListeners(ptr));

		return ptr._id;
	}

	listen(func: (val: T) => void) {
		this._ptr._listeners.push(() => func(this.value));
	}

	zip<Ptrs extends ReadonlyArray<Pointer<any>>>(
		...pointers: Ptrs
	): Pointer<
		[
			T,
			...{
				[Idx in keyof Ptrs]: Ptrs[Idx] extends Pointer<infer Val> ? Val : never;
			},
		]
	> {
		let ptr: PointerData = registerPointer({
			_type: PointerType.Zipped,
			_id: SYMBOL(),
			_listeners: [],
			_ptrs: [new Pointer(this._ptr._id), ...pointers],
		});

		ptr._ptrs.map((x) => x.listen((_) => callAllListeners(ptr)));

		return new Pointer(ptr._id);
	}

	andThen<True, False>(
		then: True,
		otherwise?: False
	): Pointer<
		| (True extends (val: T) => infer TR ? TR : True)
		| (False extends (val: T) => infer FR ? FR : False)
	> {
		return this.map((val) => {
			let real = val ? then : otherwise;
			// typescript is an idiot
			return typeof real === "function" ? (real as (val: T) => any)(val) : real;
		});
	}
	map<U>(func: (val: T) => U): Pointer<U>;
	map<U>(func: (val: T) => U, reverse: (val: U) => T): Pointer<U>;
	map<U>(func: (val: T) => U, reverse?: (val: U) => T) {
		return new Pointer(this._map(func, reverse));
	}
	mapEach<U, R>(
		this: Pointer<ArrayLike<U>>,
		func: (val: U, i: number) => R
	): Pointer<R[]> {
		return this.map((x) => Array.from(x).map(func));
	}

	clone(): Pointer<T> {
		return new Pointer(this._ptr._id);
	}
}
