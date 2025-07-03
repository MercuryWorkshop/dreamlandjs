import { TOPRIMITIVE } from "../consts";
import { initRegularPtr, isBasePtr, Pointer } from "./pointers";
import { createState, Stateful } from "./state";

export let useTrap = false;
export let setUseTrap = (val: boolean) => (useTrap = val);

let usestr = (template: TemplateStringsArray, params: any[]) => {
	let state = createState({}) as Stateful<{ _string: string }>;
	let flattened = [];
	for (let i in template) {
		flattened.push(template[i]);
		if (params[i]) {
			let val = params[i];
			let id = val[TOPRIMITIVE]();

			if (initRegularPtr(id)) {
				let prop = new Pointer(id);

				let i = flattened.length;
				prop.listen((val) => {
					flattened[i] = val;
					state._string = flattened.join("");
				});
				flattened.push("" + prop.value);
			} else {
				flattened.push("" + val);
			}
		}
	}

	state._string = flattened.join("");

	return use(state._string);
};

export let defineUse = () =>
	Object.defineProperty(globalThis, "use", {
		get() {
			useTrap = true;
			return (
				magicPtr: { [Symbol.toPrimitive]: () => symbol } | TemplateStringsArray,
				...params: any[]
			) => {
				useTrap = false;

				usestr: {
					if (magicPtr instanceof Array && "raw" in magicPtr)
						return usestr(magicPtr, params);
				}

				let id = magicPtr[TOPRIMITIVE]();
				dev: {
					if (isBasePtr(magicPtr)) throw "Illegal invocation";
				}

				initRegularPtr(id);

				return new Pointer(id);
			};
		},
	});

declare global {
	function use<T>(stateful: T): Pointer<T>;
	/* USESTR.START */
	function use(
		template: TemplateStringsArray,
		...params: any[]
	): Pointer<string>;
	/* USESTR.END */
}
