import { BasePointer, DREAMLAND, NO_CHANGE } from "dreamland/core";
import {
	DL_INTERNAL_TYPE,
	DL_INTERNAL_TYPE_MAP,
	DL_INTERNAL_TYPE_PTR,
	DL_INTERNAL_TYPE_SET,
} from "./consts";

type SerializedMap = {
	[DL_INTERNAL_TYPE]: typeof DL_INTERNAL_TYPE_MAP;
	d: Record<any, any>;
};

type SerializedSet = {
	[DL_INTERNAL_TYPE]: typeof DL_INTERNAL_TYPE_SET;
	d: any[];
};

type ExportedPointer = ExportedPointer[] | { v: any };

type SerializedPtr = {
	[DL_INTERNAL_TYPE]: typeof DL_INTERNAL_TYPE_PTR;
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
				[DL_INTERNAL_TYPE]: DL_INTERNAL_TYPE_PTR,
				p: exportPtr(value),
			};
		}
		if (value instanceof Map) {
			return <SerializedMap>{
				[DL_INTERNAL_TYPE]: DL_INTERNAL_TYPE_MAP,
				d: Object.fromEntries(value.entries()),
			};
		}
		if (value instanceof Set) {
			return <SerializedSet>{
				[DL_INTERNAL_TYPE]: DL_INTERNAL_TYPE_SET,
				d: [...value],
			};
		}

		return value;
	});
};

export let hydrateState = (state: any, target: any) => {
	for (let [k, v] of Object.entries(state)) {
		let internal = v?.[DL_INTERNAL_TYPE];
		if (internal === DL_INTERNAL_TYPE_PTR) {
			hydratePtr(target[k], (v as SerializedPtr).p);
		} else if (internal === DL_INTERNAL_TYPE_MAP) {
			target[k] = new Map(Object.entries(v));
		} else if (internal === DL_INTERNAL_TYPE_SET) {
			target[k] = new Set(v as any[]);
		} else if (!internal) {
			target[k] = v;
		}
	}
};
