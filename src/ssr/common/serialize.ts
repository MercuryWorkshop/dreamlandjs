import { Pointer, DREAMLAND, NO_CHANGE } from "dreamland/core";
import { SsrData, SsrObject, SsrPointer, SsrValue } from "./types";
import { serialize } from "v8";

let OBJECT = Object;
let Json = JSON;
let STRINGIFY = Json.stringify;

export let serializeState = (
	data: SsrData,
	object: object,
	isNode: (x: any) => boolean
): SsrObject => {
	let push = (arr: string[], val: string): number => {
		let idx = arr.indexOf(val);
		if (idx != -1) return idx;
		else return arr.push(val) - 1;
	};

	let exportPtr = (ptr: Pointer<any>) => {
		let zipped = ptr[DREAMLAND]();
		return zipped ? zipped.map(exportPtr) : { v: _val(ptr.value) };
	};

	let _val = (val: any): SsrValue | undefined => {
		if (val instanceof Pointer) {
			return { t: "p", v: exportPtr(val) };
		} else if (val instanceof Map) {
			let entries = OBJECT.fromEntries(val.entries());
			return { t: "m", v: _serialize(entries) };
		} else if (val instanceof Set) {
			let vals = [...val.values()].map((x) => _val(x));
			return { t: "s", v: vals };
		} else {
			// TODO this is ugly and leads to unnecessary escaping
			let stringified = STRINGIFY(val);
			if (!stringified) return;

			if (stringified.startsWith("{")) return { t: "o", v: _serialize(val) };
			else return push(data.v, STRINGIFY(val));
		}
	};

	let _serialize = (object: object): SsrObject => {
		let out: SsrObject = [];
		for (let k in object) {
			let v = object[k];
			let serialized = !isNode(v) && _val(v);

			if (serialized) out.push([push(data.k, k), serialized]);
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
	let _val = (val: SsrValue, target: any, ptr = false): any => {
		if (typeof val == "number") {
			return Json.parse(data.v[val]);
		} else if (val.t == "p") {
			hydratePtr(target as Pointer<any>, val.v);
			return ptr ? NO_CHANGE : target;
		} else if (val.t == "s") {
			return new Set(val.v.map((x) => _val(x, null)));
		} else if (val.t == "m") {
			let t = {};
			_hydrate(val.v, t);
			return new Map(OBJECT.entries(t));
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
