import { DREAMLAND, NO_CHANGE, WEAKMAP } from "../consts";
import { currentComponentCx } from "../jsx";
import { deref, ObjectProp } from "../utils";
import {
	_stateListen,
	_stateListenRemove,
	isStateful,
	Stateful,
	StepCollector,
	stepCollectors,
} from "./state";
import { useTrap, UseTrapMap, useTrapMap } from "./use";
import { StateListenerNode, walkStateListeners } from "./util";

let constraints: WeakMap<any, Pointer<any>[]> = WEAKMAP();

const enum PointerType {
	Regular = 0,
	Mapped = 1,
	Zipped = 2,
}

type StateStepVal = Pointer<ObjectProp> | ObjectProp;
type StateStep = {
	readonly _prop: StateStepVal;
	// the computed value used in _recalculate
	_computed?: any;
	// the current state object that has the listener, and the prop the listener
	// was registered under (_prop may be a pointer, so it can change under us)
	_state?: Stateful<any>;
	_lprop?: ObjectProp;
};
export type PointerListener<T> = (val: T) => void;
type InternalPointer<T> =
	| {
			readonly _type: PointerType.Regular;
			readonly _state: Stateful<any>;
			readonly _path: ReadonlyArray<StateStep>;
	  }
	| {
			readonly _type: PointerType.Mapped;

			readonly _ptr: Pointer<any>;
			readonly _map: (val: any) => T;
			readonly _reverse?: (val: T) => any | typeof NO_CHANGE;
	  }
	| {
			readonly _type: PointerType.Zipped;

			readonly _ptrs: ReadonlyArray<Pointer<any>>;
	  };
type InternalRegularPointer<T> = InternalPointer<T> & {
	readonly _type: PointerType.Regular;
};
type InternalZippedPointer<T> = InternalPointer<T> & {
	readonly _type: PointerType.Zipped;
};

export interface InitializingPointer {
	_state: Stateful<any>;
	_path: ObjectProp[];
	_collector: StepCollector;
}

let unwrapStep = (val: StateStep): any => unwrapValue(val._prop);
let followPath = (obj: any, path: ReadonlyArray<StateStep>): any =>
	path.reduce((acc, x) => acc[unwrapStep(x)], obj);

let newPtr = (ptr: InternalPointer<any>) => new Pointer<any>(ptr);

export let initializeStep = (
	map: UseTrapMap,
	step: ObjectProp
): StateStepVal => {
	// map will just return nothing, cast to reduce code size
	let init = map.get(step as symbol);
	if (init instanceof Pointer) return init;
	else if (!init) return step;

	stepCollectors.push(init._collector);
	init._collector._ptr = null!;

	return newPtr({
		_type: PointerType.Regular,
		_state: init._state,
		_path: init._path.map((x) => ({ _prop: initializeStep(map, x) })),
	});
};

type Truthy<T> = NonNullable<Exclude<T, false | 0 | "" | null | undefined>>;
type Falsy<T> = Extract<T, false | 0 | "" | null | undefined>;

export class Pointer<T> {
	// @internal
	declare _id?: symbol;
	// @internal
	_weak = new WeakRef(this);
	// @internal
	declare _cssIdent?: string;

	// @internal
	declare _ptr: InternalPointer<T>;
	// @internal
	_listeners: PointerListener<T>[] = [];
	// @internal
	declare d /* _deps */?: StateListenerNode;

	// @internal
	_recalculate(i: number, ptr: InternalRegularPointer<T>, step: StateStep) {
		let old = step._state,
			oldProp = step._lprop,
			// the previous step's _computed is always up to date here: both callers
			// walk forward from the step that changed
			last = i ? ptr._path[i - 1]._computed : ptr._state,
			prop = unwrapStep(step);

		step._computed = last[prop];
		step._state = isStateful(last) ? last : null;

		if (old !== step._state || oldProp !== prop) {
			if (old) _stateListenRemove(old, oldProp!, this._weak, i);
			if (step._state)
				_stateListen(step._state, (step._lprop = prop), this._weak, i);
		}
	}

	// @internal
	// called on step pointer changes and for dependencies of this pointer depending on pointer type
	_pointerChanged(i?: number) {
		if (this._ptr._type == PointerType.Regular) {
			this._changed(i!);
		} else {
			// zipped/mapped. nothing to recalculate
			this._callListeners();
		}
	}

	// @internal
	// called on regular pointer changes. recalculates step tree for stuff after itself
	_changed(i: number) {
		let ptr = this._ptr;
		dev: {
			if (ptr._type != PointerType.Regular) throw "unreachable";
		}

		for (; i < ptr._path.length; i++) {
			this._recalculate(i, ptr, ptr._path[i]);
		}

		this._callListeners();
	}

	// @internal
	_callListeners() {
		this._listeners.forEach((x) => x(this.value));
		walkStateListeners((x) => deref(x._pointer), this, "d").forEach((x) =>
			deref(x._pointer)!._pointerChanged(x._index)
		);
	}

	// @internal
	constructor(internal: InternalPointer<T>) {
		this._ptr = internal;

		if (internal._type == PointerType.Regular) {
			internal._path.forEach((x, i) => {
				if (x._prop instanceof Pointer) x._prop._listenDep(this._weak, i);
				this._recalculate(i, internal, x);
			});
		} else if (internal._type == PointerType.Mapped) {
			internal._ptr._listenDep(this._weak);
		} else if (internal._type == PointerType.Zipped) {
			internal._ptrs.forEach((x) => x._listenDep(this._weak));
		}

		if (currentComponentCx) this.constrain(currentComponentCx);
	}

	get value(): T {
		let ptr = this._ptr;

		if (ptr._type == PointerType.Regular) {
			return followPath(ptr._state, ptr._path);
		} else if (ptr._type == PointerType.Mapped) {
			return ptr._map(ptr._ptr.value);
		} else if (ptr._type == PointerType.Zipped) {
			return ptr._ptrs.map((x) => x.value) as any;
		}
		dev: {
			throw "unreachable";
		}
	}

	// @internal
	_set(val: T): boolean {
		let ptr = this._ptr;
		let recalculated: any;

		if (ptr._type == PointerType.Regular) {
			followPath(ptr._state, ptr._path.slice(0, -1))[
				unwrapStep(ptr._path[ptr._path.length - 1])
			] = val;
			return true;
		} else if (ptr._type == PointerType.Mapped) {
			if (ptr._reverse && (recalculated = ptr._reverse(val)) !== NO_CHANGE) {
				ptr._ptr.value = recalculated;
				return true;
			}
		}
		// zipped
		return false;
	}
	set value(val: T) {
		this._set(val);
	}

	[DREAMLAND](): ReadonlyArray<Pointer<any>> | undefined {
		return (this._ptr as InternalZippedPointer<T>)._ptrs;
	}

	[Symbol.toPrimitive]() {
		if (useTrap) useTrapMap.set((this._id ||= Symbol()), this);
		return this._id;
	}

	// @internal
	_listenDep(ptr: WeakRef<Pointer<any>>, i?: number): void {
		this.d = { _pointer: ptr, _index: i, _next: this.d };
	}
	listen(func: PointerListener<T>) {
		this._listeners.push(func);
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
		return newPtr({
			_type: PointerType.Zipped,
			_ptrs: [this, ...pointers],
		});
	}

	and<R>(then: R | ((val: Truthy<T>) => R)): Pointer<Falsy<T> | R> {
		return this.map(
			(val): Falsy<T> | R =>
				(val as Falsy<T>) &&
				(typeof then === "function"
					? (then as (val: Truthy<T>) => R)(val as Truthy<T>)
					: then)
		);
	}

	or<R>(then: R | ((val: Falsy<T>) => R)): Pointer<Truthy<T> | R> {
		return this.map(
			(val) =>
				(val as Truthy<T>) ||
				(typeof then === "function"
					? (then as (val: Falsy<T>) => R)(val as Falsy<T>)
					: then)
		);
	}
	not(): Pointer<boolean> {
		return this.map((val) => !val);
	}

	map<U>(func: (val: T) => U): Pointer<U>;
	map<U>(
		func: (val: T) => U,
		reverse: (val: U) => T | typeof NO_CHANGE
	): Pointer<U>;
	map<U>(_map: (val: T) => U, _reverse?: (val: U) => T | typeof NO_CHANGE) {
		return newPtr({
			_type: PointerType.Mapped,
			_ptr: this,
			_map,
			_reverse,
		});
	}
	mapEach<U, R>(
		this: Pointer<ArrayLike<U>>,
		func: (val: U, i: number) => R
	): Pointer<R[]> {
		return this.map((x) => Array.from(x).map(func));
	}

	constrain(to: any) {
		let arr = to[NO_CHANGE];
		if (!arr && !(arr = constraints.get(to))) constraints.set(to, (arr = []));
		arr.push(this);
		return this;
	}
	unconstrain(to: any) {
		let arr = to[NO_CHANGE] || constraints.get(to),
			idx;
		if (arr && (idx = arr.indexOf(this)) >= 0) {
			arr.splice(idx, 1);
		}
	}
}

export let unwrapValue = <T>(val: Pointer<T> | T): T =>
	val instanceof Pointer ? val.value : (val as T);
export let maybeListen = <T>(
	val: Pointer<T> | T,
	constrain: any,
	func: (val: T) => void,
	pointer?: () => void
) => {
	let old = val;
	if (val instanceof Pointer) {
		pointer?.();
		val
			.constrain(constrain)
			.listen((val) => old !== val && (func(val), (old = val)));
	}
	func(unwrapValue(val));
};
