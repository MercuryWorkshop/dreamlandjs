import { Pointer, DREAMLAND, NO_CHANGE } from "dreamland/core";
import { SsrData, SsrObject, SsrPointer, SsrValue } from "./types";

export let Json = JSON;
let STRINGIFY = Json.stringify;

export let serializeState = (
	data: SsrData,
	object: object,
	isNode: (x: any) => boolean
): SsrObject => {
	let push = (arr: string[], val: any): number => {
		let idx = arr.indexOf(val)
		if (idx != -1) return idx;
		else return arr.push(val) - 1;
	};

	let exportPtr = (ptr: Pointer<any>) => {
		let zipped = ptr[DREAMLAND]();
		return zipped ? zipped.map(exportPtr) : { v: _val(ptr.value) };
	};

	let isUndefined = (x: any): x is undefined => typeof x == "undefined";

	let _val = (val: any): SsrValue | undefined => {
		if (!["bigint", "function", "object"].includes(typeof val)) {
			return push(data.v, val);
		} else if (val instanceof Pointer) {
			return { t: "p", v: exportPtr(val) };
		} else if (val instanceof Map) {
			let entries = Object.fromEntries(val.entries());
			return { t: "m", v: _serialize(entries) };
		} else if (val instanceof Set) {
			let vals = [...val.values()].map((x) => _val(x));
			if (vals.some(isUndefined)) return;

			return { t: "s", v: vals };
		} else if (val instanceof Array) {
			let vals = val.map((x) => _val(x));
			if (vals.some(isUndefined)) return;
			return { t: "a", v: vals };
		} else if (typeof val === "object" && [undefined, Object].includes(val.constructor)) {
			return { t: "o", v: _serialize(val) }
		} else if (isNode(val)) {
		} else {
			dev: {
				console.warn("[dreamland.js] did not serialize unknown value ", val);
			}
		}
	};

	let _serialize = (object: object): SsrObject => {
		let out: SsrObject = [];
		for (let k in object) {
			let v = object[k];
			let val = _val(v);

			if (!isUndefined(val)) out.push([push(data.k, k), val]);
		}
		return out;
	};

	return _serialize(object);
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
		} else if (val.t == "p") {
			hydratePtr(target as Pointer<any>, val.v);
			return ptr ? NO_CHANGE : target;
		} else if (val.t == "s") {
			return new Set(val.v.map((x) => _val(x, {})));
		} else if (val.t == "m") {
			let t = {};
			_hydrate(val.v, t);
			return new Map(Object.entries(t));
		} else if (val.t == "a") {
			return val.v.map((x) => _val(x, {}));
		} else if (val.t == "o") {
			_hydrate(val.v, target);
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
