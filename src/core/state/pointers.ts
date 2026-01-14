import {
	ARRAY,
	DREAMLAND,
	NO_CHANGE,
	SYMBOL,
	TOPRIMITIVE,
	WEAKMAP,
	WEAKREF,
} from "../consts";
import { deref, ObjectProp } from "../utils";
import {
	_stateListen,
	_stateListenRemove,
	isStateful,
	Stateful,
} from "./state";
import { useTrap, UseTrapMap, useTrapMap } from "./use";

let constraints: WeakMap<any, Pointer<any>[]> = WEAKMAP();
let internalPointers: WeakMap<Pointer<any>, InternalPointer<any>> = WEAKMAP();

export let DEFAULT_CONSTRAINER: any | false | undefined;
export let setConstrainer = (constrainer: typeof DEFAULT_CONSTRAINER) => DEFAULT_CONSTRAINER = constrainer;

const enum PointerType {
	Regular = 0,
	Mapped = 1,
	Zipped = 2,
}

type StateStepListener = (prop?: ObjectProp) => void;
type StateStepVal = Pointer<ObjectProp> | ObjectProp;
type StateStep = {
	readonly _prop: StateStepVal;
	// the computed value used in _recalculate
	_computed?: any;
	// the current state object that has the listener
	_state?: Stateful<any>;
	// the listener
	_callback?: StateStepListener;
	// listener weakref
	_callbackRef?: WeakRef<StateStepListener>;
};
export type PointerListener<T> = (val: T) => void;
type InternalPointer<T> = {
	_listeners: PointerListener<T>[];
	_weaks: WeakRef<PointerListener<T>>[];
} & (
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
	  }
);
type InternalRegularPointer<T> = InternalPointer<T> & {
	readonly _type: PointerType.Regular;
};
type InternalZippedPointer<T> = InternalPointer<T> & {
	readonly _type: PointerType.Zipped;
};

export interface InitializingPointer {
	_state: Stateful<any>;
	_path: ObjectProp[];
}

let unwrapStep = (val: StateStep): any => unwrapValue(val._prop);
let followPath = (obj: any, path: ReadonlyArray<StateStep>): any =>
	path.reduce((acc, x) => acc[unwrapStep(x)], obj);

export let initializeStep = (
	map: UseTrapMap,
	step: ObjectProp
): StateStepVal => {
	// map will just return nothing, cast to reduce code size
	let init = map.get(step as symbol);
	if (isPointer(init)) return init;
	else if (!init) return step;

	return new Pointer({
		_listeners: [],
		_weaks: [],
		_type: PointerType.Regular,
		_state: init._state,
		_path: init._path.map((x) => ({ _prop: initializeStep(map, x) })),
	} satisfies InternalPointer<any>);
};

type Truthy<T> = NonNullable<Exclude<T, false | 0 | "" | null | undefined>>;
type Falsy<T> = Extract<T, false | 0 | "" | null | undefined>;

export class Pointer<T> {
	// @internal
	_id: symbol = SYMBOL();
	// @internal
	_listener = this._callListeners.bind(this);
	// @internal
	_cssIdent?: string;

	// @internal
	get _ptr(): InternalPointer<T> {
		return internalPointers.get(this)!;
	}

	// @internal
	_recalculate(i: number, ptr: InternalRegularPointer<T>, step: StateStep) {
		let old = step._state;
		let before = ptr._path.slice(0, i);

		step._computed = followPath(ptr._state, before)[unwrapStep(step)];
		step._state =
			before.reverse().find((x) => isStateful(x._computed))?._computed ||
			ptr._state;

		if (step._state !== old) {
			if (old) _stateListenRemove(old, step._callbackRef!);
			_stateListen(step._state, step._callbackRef!);
		}
	}

	// @internal
	_changed(i: number, _: any, prop?: ObjectProp) {
		let ptr = this._ptr;
		dev: {
			if (ptr._type != PointerType.Regular) throw "unreachable";
		}
		if (prop && prop !== unwrapStep(ptr._path[i])) return;

		for (; i < ptr._path.length; i++) {
			this._recalculate(i, ptr, ptr._path[i]);
		}

		this._callListeners();
	}

	// @internal
	_callListeners() {
		let ptr = this._ptr;
		ptr._listeners.map((x) => x(this.value));
		(ptr._weaks = ptr._weaks.filter(deref)).map((x) => deref(x)!(this.value));
	}

	// @internal
	constructor(internal: InternalPointer<T>) {
		internalPointers.set(this, internal);

		if (internal._type == PointerType.Regular) {
			internal._path.map((x, i) => {
				x._callback = this._changed.bind(this, i);
				x._callbackRef = WEAKREF(x._callback);
				if (isPointer(x._prop)) x._prop._listenWeak(x._callbackRef);
				this._recalculate(i, internal, x);
			});
		} else if (internal._type == PointerType.Mapped) {
			internal._ptr._listenWeak(WEAKREF(this._listener));
		} else if (internal._type == PointerType.Zipped) {
			internal._ptrs.map((x) => x._listenWeak(WEAKREF(this._listener)));
		}

		if (DEFAULT_CONSTRAINER) this.constrain(DEFAULT_CONSTRAINER);
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

	[TOPRIMITIVE]() {
		if (useTrap) useTrapMap.set(this._id, this);
		return this._id;
	}

	// @internal
	_listenWeak(func: WeakRef<PointerListener<T>>): void {
		this._ptr._weaks.push(func);
	}
	listen(func: PointerListener<T>) {
		this._ptr._listeners.push(func);
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
		return new Pointer({
			_listeners: [],
			_weaks: [],
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

	map<U>(func: (val: T) => U): Pointer<U>;
	map<U>(func: (val: T) => U, reverse: (val: U) => T): Pointer<U>;
	map<U>(_map: (val: T) => U, _reverse?: (val: U) => T) {
		return new Pointer({
			_listeners: [],
			_weaks: [],
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
		return this.map((x) => ARRAY.from(x).map(func));
	}

	constrain(to: any) {
		if (!constraints.has(to)) constraints.set(to, []);
		constraints.get(to)!.push(this);
		return this;
	}
	unconstrain(to: any) {
		constraints.set(to, constraints.get(to)?.filter((x) => x !== this) || []);
	}
}

export let isPointer = <T>(val: Pointer<T> | T): val is Pointer<T> => val instanceof Pointer;
export let unwrapValue = <T>(val: Pointer<T> | T): T =>
	isPointer(val) ? val.value : (val as T);
export let maybeListen = <T>(
	val: Pointer<T> | T,
	constrain: any,
	func: (val: T) => void,
	pointer?: () => void
) => {
	let old = val;
	if (isPointer(val)) {
		pointer?.();
		val
			.constrain(constrain)
			.listen((val) => old !== val && (func(val), (old = val)));
	}
	func(unwrapValue(val));
};
