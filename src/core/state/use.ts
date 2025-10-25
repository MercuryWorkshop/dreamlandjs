import { MAP, TOPRIMITIVE } from "../consts";
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

let usestr = (
	map: UseTrapMap,
	template: TemplateStringsArray,
	params: any[]
) => {
	let state = createState({}) as Stateful<{ _string: string }>;
	let flattened = [];
	for (let i in template) {
		flattened.push(template[i]);
		if (params[i]) {
			let val = params[i];
			let prop = initializeStep(map, val[TOPRIMITIVE]());

			if (isPointer(prop)) {
				let i = flattened.length;
				prop.listen((val) => {
					flattened[i] = val;
					state._string = flattened.join("");
				});
				flattened.push(prop.value);
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
				useTrap = false;

				let map = useTrapMap;
				useTrapMap = MAP();

				usestr: {
					if (magicPtr instanceof Array && "raw" in magicPtr)
						return usestr(map, magicPtr, params);
				}

				let init = (x) => {
					dev: {
						if (isPointer(x)) throw "Illegal invocation";
					}
					let initted = initializeStep(map, x[TOPRIMITIVE]());
					dev: {
						if (!isPointer(initted)) throw "Illegal invocation";
					}
					return initted;
				};

				magicPtr = init(magicPtr);
				return params.length
					? (magicPtr as Pointer<any>).zip(...params.map(init))
					: magicPtr;
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
