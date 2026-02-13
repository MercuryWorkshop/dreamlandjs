import { Pointer, DREAMLAND, NO_CHANGE } from "dreamland/core";
import { SsrData, SsrObject, SsrPointer, SsrValue } from "./types";

export let Json = JSON;

export let serializeState = (
	data: SsrData,
	object: object,
	isNode: (x: any) => boolean
): SsrObject => {
	let push = (arr: string[], val: any): number => {
		let idx = arr.indexOf(val);
		if (idx != -1) return idx;
		else return arr.push(val) - 1;
	};

	let exportPtr = (ptr: Pointer<any>): SsrPointer => {
		let zipped = ptr[DREAMLAND]();
		return zipped ? zipped.map(exportPtr) : { v: _val(ptr.value) };
	};

	let isUndefined = (x: any): x is undefined => typeof x == "undefined";

	let _val = (val: any): SsrValue | undefined => {
		if (!["bigint", "function", "object"].includes(typeof val)) {
			return push(data.v, val);
		} else if (val instanceof Pointer) {
			return [4, exportPtr(val)];
		} else if (val instanceof Map) {
			let entries = Object.fromEntries(val.entries());
			return [0, _serialize(entries)];
		} else if (val instanceof Set) {
			let vals = [...val.values()].map((x) => _val(x));
			if (vals.some(isUndefined)) return;

			return [2, vals];
		} else if (val instanceof Array) {
			let vals = val.map((x) => _val(x));
			if (vals.some(isUndefined)) return;

			return [3, vals];
		} else if (
			typeof val === "object" &&
			[undefined, Object].includes(val.constructor)
		) {
			return [1, _serialize(val)];
		} else if (!isNode(val)) {
			dev: {
				if (val instanceof Function) return;

				console.warn("[dreamland.js] did not serialize unknown value ", val);
			}
		}
	};

	let _serialize = (object: any, root?: boolean): SsrObject => {
		let out: SsrObject = [];
		for (let k in object) {
			if (root && ["cx", "root"].includes(k)) continue;

			let v = object[k];
			let val = _val(v);

			if (!isUndefined(val)) out.push([push(data.k, k), val]);
		}
		return out;
	};

	return _serialize(object, true);
};

export let hydrateState = (data: SsrData, state: SsrObject, target: any) => {
	let hydratePtr = (ptr: Pointer<any>, data: SsrPointer) => {
		if (data instanceof Array) {
			ptr[DREAMLAND]()!.forEach((x, i) => hydratePtr(x, data[i]));
		} else {
			ptr.value = _val(data.v, ptr.value, true);
		}
	};

	// TODO this is ugly
	let _val = (val: SsrValue, target?: any, ptr?: boolean): any => {
		if (typeof val == "number") {
			return data.v[val];
		}

		let [type, v] = val as any;
		if (type == 4) {
			hydratePtr(target as Pointer<any>, v);
			return ptr ? NO_CHANGE : target;
		} else if (type == 2) {
			return new Set(v.map((x: SsrValue) => _val(x, {})));
		} else if (type == 0) {
			let t = {};
			_hydrate(v, t);
			return new Map(Object.entries(t));
		} else if (type == 3) {
			return v.map((x: SsrValue) => _val(x, {}));
		} else if (type == 1) {
			target ||= {};
			_hydrate(v, target);
			return target;
		}
	};

	let _hydrate = (state: SsrObject, target: any) => {
		for (let [_k, v] of state) {
			let k = data.k[_k];
			target[k] = _val(v, target[k]);
		}
	};

	_hydrate(state, target);
};
