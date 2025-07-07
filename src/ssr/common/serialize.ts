import { BasePointer, ExportedPointer, DREAMLAND } from "dreamland/core";
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

type SerializedPtr = {
	[DL_INTERNAL_TYPE]: typeof DL_INTERNAL_TYPE_PTR;
	p: ExportedPointer;
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
			let data = value[DREAMLAND]();
			if (!data)
				throw new Error("failed to serialize pointer: type unsupported");

			return <SerializedPtr>{
				[DL_INTERNAL_TYPE]: DL_INTERNAL_TYPE_PTR,
				p: data,
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
