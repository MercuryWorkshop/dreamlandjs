import { ARRAY, DREAMLAND, NO_CHANGE, SYMBOL, TOPRIMITIVE } from "../consts";
import { ObjectProp } from "../utils";
import {
	_stateListen,
	_stateListenRemove,
	isStateful,
	Stateful,
} from "./state";
import { useTrap, UseTrapMap, useTrapMap } from "./use";

let internalPointers: WeakMap<
	Pointer<any>,
	InternalPointer<any>
> = new WeakMap();

const enum PointerType {
	Regular = 0,
	Mapped = 1,
	Zipped = 2,
}

type PointerListener = (prop?: ObjectProp) => void;

type StateStepVal = Pointer<ObjectProp> | ObjectProp;
type StateStep = {
	readonly _prop: StateStepVal;
	// the computed value used in _recalculate
	_computed?: any;
	// the current state object that has the listener
	_state?: Stateful<any>;
	// the listener
	_callback?: PointerListener;
};
type InternalPointer<T> = { _listeners: ((val: T) => void)[] } & (
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
		_type: PointerType.Regular,
		_state: init._state,
		_path: init._path.map((x) => ({ _prop: initializeStep(map, x) })),
	} satisfies InternalPointer<any>);
};

export class Pointer<T> {
	// @internal
	_id: symbol = SYMBOL();

	// @internal
	_cssIdent?: string;

	// @internal
	get _ptr(): InternalPointer<T> {
		return internalPointers.get(this);
	}

	// @internal
	_recalculate(i: number, ptr: InternalRegularPointer<T>, step: StateStep) {
		if (step._state) _stateListenRemove(step._state, step._callback);

		let before = ptr._path.slice(0, i);

		step._computed = followPath(ptr._state, before)[unwrapStep(step)];
		step._state =
			before.reverse().find((x) => isStateful(x._computed))?._computed ||
			ptr._state;

		_stateListen(step._state, step._callback);
	}

	// @internal
	_changed(i: number, prop?: ObjectProp) {
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
		this._ptr._listeners.map((x) => x(this.value));
	}

	// @internal
	constructor(internal: InternalPointer<T>) {
		internalPointers.set(this, internal);

		if (internal._type == PointerType.Regular) {
			internal._path.map((x, i) => {
				x._callback = this._changed.bind(this, i);
				if (isPointer(x._prop)) x._prop.listen((_) => x._callback());
				this._recalculate(i, internal, x);
			});
		} else if (internal._type == PointerType.Mapped) {
			internal._ptr.listen((_) => this._callListeners());
		} else if (internal._type == PointerType.Zipped) {
			internal._ptrs.map((x) => x.listen((_) => this._callListeners()));
		}
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

	[DREAMLAND](): ReadonlyArray<Pointer<any>> | null {
		return (
			(this._ptr as InternalPointer<T> & { _type: PointerType.Zipped })._ptrs ||
			null
		);
	}

	[TOPRIMITIVE]() {
		if (useTrap) useTrapMap.set(this._id, this);
		return this._id;
	}

	listen(func: (val: T) => void) {
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
			_type: PointerType.Zipped,
			_ptrs: [this, ...pointers],
		});
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
	map<U>(_map: (val: T) => U, _reverse?: (val: U) => T) {
		return new Pointer({
			_listeners: [],
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
}

export let isPointer = (val: any): val is Pointer<any> =>
	val instanceof Pointer;
export let unwrapValue = <T>(val: Pointer<T> | T): T =>
	isPointer(val) ? val.value : val;
export let maybeListen = <T>(
	val: Pointer<T> | T,
	func: (val: T) => void,
	pointer?: () => void
) => {
	if (isPointer(val)) {
		pointer?.();
		val.listen(func);
	}
	func(unwrapValue(val));
};
