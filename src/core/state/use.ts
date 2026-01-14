import { MAP, TOPRIMITIVE } from "../consts";
import { isArray } from "../utils";
import {
	initializeStep,
	InitializingPointer,
	isPointer,
	Pointer,
} from "./pointers";
import { createState, Stateful } from "./state";

// epheremal strong reference allowing pointers to be recorded and then looked up later
export type UseTrapElement = Pointer<any> | InitializingPointer;
export type UseTrapMap = Map<symbol, UseTrapElement>;
export let useTrapMap: UseTrapMap = MAP();

export let useTrap = false;

let initializeSteps = (map: UseTrapMap, ...steps: any) => {
	let prims = steps.map((x: any) => [x, x[TOPRIMITIVE]()]);
	useTrap = false;
	useTrapMap = MAP();
	return prims.map(([a, b]: any) => {
		let initialized = initializeStep(map, b);
		return isPointer(initialized) ? initialized: a;
	});
}

let usestr = (
	template: TemplateStringsArray,
	params: any[]
) => {
	let state = createState({}) as Stateful<{ _string: string }>;
	let flattened = [];

	for (let i in template) {
		flattened.push(template[i]);
		if (params[i]) {
			let val = params[i];

			if (isPointer(val)) {
				let i = flattened.length;
				val.constrain(state).listen((val) => {
					flattened[i] = val;
					state._string = flattened.join("");
				});
				flattened.push(val.value);
			} else {
				flattened.push(val);
			}
		}
	}

	state._string = flattened.join("");

	return use(state._string);
};

export let defineUse = () => {
	Object.defineProperty(globalThis, "use", {
		get() {
			useTrap = true;
			return (
				magicPtr: { [Symbol.toPrimitive]: () => symbol } | TemplateStringsArray,
				...params: any[]
			) => {
				let map = useTrapMap;

				usestr: {
					if (isArray(magicPtr) && "raw" in magicPtr)
						return usestr(magicPtr, initializeSteps(map, ...params));
				}

				let [init, ...rest] = initializeSteps(map, magicPtr, ...params);

				return params.length
					? init.zip(...rest)
					: init;
			};
		},
		configurable: true,
	});
};

declare global {
	function use<T>(stateful: T): Pointer<T>;
	function use<T extends any[]>(...statefuls: T): Pointer<T>;
	/* USESTR.START */
	function use(
		template: TemplateStringsArray,
		...params: any[]
	): Pointer<string>;
	/* USESTR.END */
}
