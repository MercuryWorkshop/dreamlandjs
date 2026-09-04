import {
	createState,
	isStateful,
	NO_CHANGE,
	Stateful,
	StatefulListener,
	stateListen,
	stateListenRemove,
} from "dreamland/core";

export type PrimitiveVal = undefined | null | string | number | boolean;
export type SerializedPrimitiveVal = null | string | number | boolean | [];

const enum WatchedValType {
	Primitive,
	Ref,
}

const enum WatchedRefType {
	Object,
	Array,
	Set,
	Map,
}

type WatchedRefData =
	| {
			_type: WatchedRefType.Object;
			_stateful: boolean;
			_val: [string, WatchedVal][];
	  }
	| { _type: WatchedRefType.Array; _val: WatchedVal[] }
	| { _type: WatchedRefType.Set; _val: WatchedVal[] }
	| { _type: WatchedRefType.Map; _val: [WatchedVal, WatchedVal][] };

type WatchedRef = { _id: number; _data?: WatchedRefData };
type WatchedVal =
	| { _type: WatchedValType.Primitive; _val: PrimitiveVal }
	| { _type: WatchedValType.Ref; _id: number };
export type WatchedState = Map<string, [string[], WatchedVal]>;
export type ObjectMap = Map<any, WatchedRef>;

type SerializedObjectVals = [number, SerializedVal][];
type SerializedMapVals = [SerializedVal, SerializedVal][];
type SerializedRef =
	| [stateful: 0 | 1, ...vals: SerializedObjectVals] // Object
	| [2, ...SerializedVal[]] // Array
	| [3, ...SerializedMapVals] // Map
	| [4, ...SerializedVal[]]; // Set
type RefShell =
	| [
			Record<string, any> | Stateful<Record<string, any>>,
			vals: SerializedObjectVals,
	  ]
	| [any[], SerializedVal[]]
	| [Map<any, any>, SerializedMapVals]
	| [Set<any>, SerializedVal[]];
export type SerializedVal = number | SerializedRef; // positive ref to primstore, negative ref to refstore, or inline reference type

export type KeyStore = string[];
export type PrimStore = SerializedPrimitiveVal[];
export type RefStore = SerializedRef[];
export type RefShellStore = RefShell[];
export type SerializedState = [val: SerializedVal, last: number, ...number[]][];

export let watchState = async (
	state: Stateful<any>,
	objects: ObjectMap,
	cb: () => Promise<any> | any
): Promise<WatchedState> => {
	let changes: WatchedState = new Map();

	let states = new Map<Stateful<any>, StatefulListener>();
	let watchState = (state: Stateful<any>, path: string[]) => {
		let l: StatefulListener = (a, b) => listener(path, a, b);
		if (!states.has(state) && !state[NO_CHANGE]) {
			states.set(state, l);
			stateListen(state, l);
			for (let k in state)
				if (isStateful(state[k])) watchState(state[k], [...path, k]);
		}
	};

	let serialize = (val: unknown, set: Set<any>): WatchedVal | undefined => {
		if (
			typeof val == "string" ||
			typeof val == "number" ||
			typeof val == "boolean" ||
			val === undefined ||
			val === null
		) {
			return { _type: WatchedValType.Primitive, _val: val };
		} else {
			let entry: WatchedRef;
			let replace = !set.has(val);

			if (objects.has(val)) entry = objects.get(val)!;
			else {
				objects.set(val, (entry = { _id: objects.size } as WatchedRef));
				replace = true;
			}

			set.add(val);
			if (replace) {
				let data: WatchedRefData;
				if (val instanceof Array) {
					data = {
						_type: WatchedRefType.Array,
						_val: val.map(
							(x) =>
								serialize(x, set) || {
									_type: WatchedValType.Primitive,
									_val: undefined,
								}
						),
					};
				} else if (val instanceof Map) {
					data = {
						_type: WatchedRefType.Map,
						_val: [...val.entries()].flatMap(([k, v]) => {
							let key = serialize(k, set);
							let val = serialize(v, set);
							if (key && val) return [[key, val]];
							else return [];
						}),
					};
				} else if (val instanceof Set) {
					data = {
						_type: WatchedRefType.Set,
						_val: [...val].flatMap((x) => {
							let serialized = serialize(x, set);
							if (serialized) return [serialized];
							else return [];
						}),
					};
				} else if (
					typeof val == "object" &&
					(val.constructor === undefined || val.constructor === Object) &&
					!(val as any)[NO_CHANGE]
				) {
					let props = [];
					for (let prop in val) {
						let serialized = serialize((val as any)[prop], set);
						if (serialized)
							props.push([prop, serialized] as [string, WatchedVal]);
					}
					data = {
						_type: WatchedRefType.Object,
						_stateful: isStateful(val),
						_val: props,
					};
				} else {
					dev: {
						console.warn(
							"[dreamland/ssr] unsupported ref type skipped while serializing",
							val
						);
					}
					set.delete(val);
					// not safe to delete from objects map
					return undefined;
				}
				entry._data = data;
			}

			return { _type: WatchedValType.Ref, _id: entry._id };
		}
	};
	let listener = (path: string[], newValue: any, prop: string | symbol) => {
		if (typeof prop != "string") return;
		let newPath = [...path, prop];
		if (isStateful(newValue)) watchState(newValue, newPath);

		let serialized = serialize(newValue, new Set());
		if (serialized) changes.set(JSON.stringify(newPath), [newPath, serialized]);
	};

	watchState(state, []);
	try {
		await cb();

		return changes;
	} finally {
		states.forEach((a, b) => stateListenRemove(b, a));
	}
};

export let serializeWatchedStates = (
	_objects: ObjectMap,
	changes: [number, WatchedState][]
): [KeyStore, PrimStore, RefStore, [number, SerializedState][]] => {
	let objects = new Map([..._objects].map((x) => [x[1]._id, x[1]]));

	let keyCounts = new Map<string, number>();
	let primCounts = new Map<PrimitiveVal, number>();
	let refCounts = new Map<number, number>();
	let refq: number[] = [];
	let inc = <T>(map: Map<T, number>, val: T) =>
		map.set(val, (map.get(val) || 0) + 1);
	let count = (val: WatchedVal) => {
		if (val._type == WatchedValType.Primitive) {
			inc(primCounts, val._val);
		} else {
			let n = refCounts.get(val._id) || 0;
			refCounts.set(val._id, n + 1);
			if (!n) refq.push(val._id);
		}
	};
	for (let [_, state] of changes) {
		for (let [path, v] of state.values()) {
			path.forEach((k) => inc(keyCounts, k));
			count(v);
		}
	}
	while (refq.length) {
		let ref = objects.get(refq.pop()!)!._data;
		if (ref?._type === WatchedRefType.Object) {
			for (let [k, v] of ref._val) {
				inc(keyCounts, k);
				count(v);
			}
		} else if (ref?._type === WatchedRefType.Array) {
			ref._val.forEach((x) => {
				if (x) count(x);
			});
		} else if (ref?._type === WatchedRefType.Set) {
			ref._val.forEach(count);
		} else if (ref?._type === WatchedRefType.Map) {
			ref._val.forEach(([k, v]) => {
				count(k);
				count(v);
			});
		}
	}

	let keyStore = [...keyCounts].sort((a, b) => b[1] - a[1]).map(([x]) => x);
	let primStore = [...primCounts].sort((a, b) => b[1] - a[1]).map(([x]) => x);
	let refStore = [...refCounts]
		.filter(([_, n]) => n > 1)
		.sort((a, b) => b[1] - a[1])
		.map(([x]) => x);

	let keys = new Map(keyStore.map((x, i) => [x, i]));
	let prims = new Map(primStore.map((x, i) => [x, i]));
	let refs = new Map(refStore.map((x, i) => [x, i]));

	let convertRef = (val: WatchedRef): SerializedRef => {
		let obj = objects.get(val._id)!._data;
		if (obj?._type === WatchedRefType.Object) {
			return [
				obj._stateful ? 1 : 0,
				...obj._val.map(
					([k, v]) => [keys.get(k)!, convertVal(v)] as [number, SerializedVal]
				),
			];
		} else if (obj?._type === WatchedRefType.Array) {
			return [2, ...obj._val.map((x) => (x ? convertVal(x) : x))];
		} else if (obj?._type === WatchedRefType.Map) {
			return [
				3,
				...obj._val.map(
					([k, v]) =>
						[convertVal(k), convertVal(v)] as [SerializedVal, SerializedVal]
				),
			];
		} else if (obj?._type === WatchedRefType.Set) {
			return [4, ...obj._val.map((x) => convertVal(x))];
		}
		throw new Error("unreachable??");
	};
	let convertVal = (val: WatchedVal): SerializedVal => {
		if (val._type === WatchedValType.Primitive) {
			return prims.get(val._val)!;
		} else {
			if (refs.has(val._id)) {
				return -1 - refs.get(val._id)!;
			} else {
				return convertRef(val);
			}
		}
	};

	return [
		keyStore,
		primStore.map((x) => (x === undefined ? [] : x)),
		refStore.map((x) => convertRef(objects.get(x)!)),
		changes.map(([i, x]) => [
			i,
			[...x.values()].map(([path, val]) => {
				let last = keys.get(path[path.length - 1]!)!;
				let rest = path.slice(0, -1).map((x) => keys.get(x)!);
				return [convertVal(val), last, ...rest];
			}),
		]),
	];
};

export let getStateApplier = (
	keyStore: KeyStore,
	primStore: PrimStore,
	refStore: RefStore
) => {
	let shellFor = ([n, ...x]: SerializedRef): RefShell => {
		if (n < 2) return [n ? createState({}) : {}, x as any];
		else if (n == 2) return [[], x as any];
		else if (n == 3) return [new Map(), x as any];
		else if (n == 4) return [new Set(), x as any];
		dev: {
			throw new Error("unreachable??");
		}
	};
	let fill = ([shell, vals]: RefShell): any => {
		if (shell instanceof Array) {
			(vals as any as SerializedVal[]).forEach((x) => {
				shell.push(hydrateVal(x));
			});
		} else if (shell instanceof Map) {
			(vals as any as SerializedMapVals).forEach(([k, v]) => {
				shell.set(hydrateVal(k), hydrateVal(v));
			});
		} else if (shell instanceof Set) {
			(vals as any as SerializedVal[]).forEach((x) => {
				shell.add(hydrateVal(x));
			});
		} else {
			(vals as any as SerializedObjectVals).forEach(([k, v]) => {
				shell[keyStore[k]] = hydrateVal(v);
			});
		}
		return shell;
	};
	let hydrateVal = (val: SerializedVal): any => {
		if (val instanceof Array) {
			return fill(shellFor(val));
		} else if (val < 0) {
			return refs[-1 - val][0];
		} else {
			return prims[val];
		}
	};
	let prims = primStore.map((x) => (x instanceof Array ? undefined : x));
	let refs = refStore.map(shellFor);
	refs.forEach(fill);

	return (state: Stateful<any>, serialized: SerializedState) => {
		for (let [val, last, ...path] of serialized) {
			path.reduce((acc, x) => acc[keyStore[x]], state)[keyStore[last]] =
				hydrateVal(val);
		}
	};
};
