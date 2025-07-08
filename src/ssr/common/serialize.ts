import { BasePointer, DREAMLAND, NO_CHANGE } from "dreamland/core";
import {
	INTERNAL_TYPE,
	INTERNAL_TYPE_MAP,
	INTERNAL_TYPE_PTR,
	INTERNAL_TYPE_SET,
} from "./consts";

type SerializedMap = {
	[INTERNAL_TYPE]: typeof INTERNAL_TYPE_MAP;
	d: Record<any, any>;
};

type SerializedSet = {
	[INTERNAL_TYPE]: typeof INTERNAL_TYPE_SET;
	d: any[];
};

type ExportedPointer = ExportedPointer[] | { v: any };

type SerializedPtr = {
	[INTERNAL_TYPE]: typeof INTERNAL_TYPE_PTR;
	p: ExportedPointer;
};

let exportPtr = (ptr: BasePointer<any>) => {
	let zipped = ptr[DREAMLAND]();
	return zipped ? zipped.map(exportPtr) : { v: ptr.value };
};
let hydratePtr = (ptr: BasePointer<any>, data: ExportedPointer) => {
	if (data instanceof Array) {
		ptr[DREAMLAND]()!.forEach((x, i) => hydratePtr(x, data[i]));
	} else {
		ptr[NO_CHANGE](data.v);
	}
};

// used on serverside only
export let serializeState: (state: any) => string = (
	state: any,
	first = false
): string => {
	return JSON.stringify(state, (key, value) => {
		if (!first) {
			first = true;
			return value;
		}

		if (key === "") throw new Error("you suck");

		if (value instanceof BasePointer) {
			return <SerializedPtr>{
				[INTERNAL_TYPE]: INTERNAL_TYPE_PTR,
				p: exportPtr(value),
			};
		}
		if (value instanceof Map) {
			return <SerializedMap>{
				[INTERNAL_TYPE]: INTERNAL_TYPE_MAP,
				d: Object.fromEntries(value.entries()),
			};
		}
		if (value instanceof Set) {
			return <SerializedSet>{
				[INTERNAL_TYPE]: INTERNAL_TYPE_SET,
				d: [...value],
			};
		}

		return value;
	});
};

export let hydrateState = (state: any, target: any) => {
	for (let [k, v] of Object.entries(state)) {
		let internal = v?.[INTERNAL_TYPE];
		if (internal === INTERNAL_TYPE_PTR) {
			hydratePtr(target[k], (v as SerializedPtr).p);
		} else if (internal === INTERNAL_TYPE_MAP) {
			target[k] = new Map(Object.entries(v));
		} else if (internal === INTERNAL_TYPE_SET) {
			target[k] = new Set(v as any[]);
		} else if (!internal && typeof v != "object") {
			target[k] = v;
		} else {
			hydrateState(v, (target[k] ||= {}));
		}
	}
};
