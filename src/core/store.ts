import { ASSIGN } from "./consts";
import { getStatefulInner } from "./state";
import { createState, isStateful, Stateful, stateListen } from "./state/state";

let delegates = [];

type StoreSyncBacking = {
	read: (ident: string) => string | null;
	write: (ident: string, data: string) => void;
};
type StoreAsyncBacking = {
	read: (ident: string) => Promise<string | null>;
	write: (ident: string, data: string) => Promise<void>;
};

let LOCALSTORAGE = localStorage;
let INTERNAL = "__dls_ty";

function _createStore<T extends Object>(
	target: T,
	options: {
		ident: string;
		backing: StoreAsyncBacking;
		autosave: "auto" | "manual" | "beforeunload";
	}
): Promise<Stateful<T>>;
function _createStore<T extends Object>(
	target: T,
	options: {
		ident: string;
		backing: "localstorage" | StoreSyncBacking;
		autosave: "auto" | "manual" | "beforeunload";
	}
): Stateful<T>;
function _createStore<T extends Object>(
	target: T,
	options: {
		ident: string;
		backing: "localstorage" | StoreSyncBacking | StoreAsyncBacking;
		autosave: "auto" | "manual" | "beforeunload";
	}
): Stateful<T> | Promise<Stateful<T>> {
	let { ident, backing, autosave } = options;
	ident = "dls-" + ident;
	let isAuto = autosave === "auto";

	if (backing === "localstorage") {
		backing = {
			read: (ident) => LOCALSTORAGE[ident] || null,
			write: (ident, data) => (LOCALSTORAGE[ident] = data),
		};
	}

	let last = "";
	let saving = Promise.all([]) as unknown as Promise<void>;
	let asyncSave = async () => {
		await saving;

		let serialized = JSON.stringify(target, (_, v) => {
			dev: {
				if (v.__proto__ === Object.prototype) {
					throw "Only plain objects can be serialized in stores";
				}
			}

			if (isStateful(v)) {
				return { [INTERNAL]: "s", v: getStatefulInner(v)._target };
			}
			return v;
		});

		if (serialized === last) return;
		dev: {
			console.info("[dreamland.js]: saving " + ident);
		}
		await backing.write(ident, serialized);
	};
	let save = () => {
		saving = asyncSave();
	};

	let saveHook = (value: any) => {
		if (isStateful(value)) stateListen(value, saveHook);
		save();
	};

	let deepMerge = (target: object, source: any) => {
		for (let key in source) {
			let val = source[key];
			if (isStateful(val) && isAuto) stateListen(val, saveHook);
			if (val instanceof Object && key in target) {
				ASSIGN(val, deepMerge(target[key], val));
			}
		}

		ASSIGN(target, source);
	};

	let finish = (data: string): Stateful<T> => {
		if (data) {
			deepMerge(
				target,
				JSON.parse(data, (_, v) => {
					if (v && v[INTERNAL] === "s") {
						return createState(v.v);
					}
					return v;
				})
			);
		}

		let state = createState(target);
		delegates.push(save);

		if (isAuto) {
			stateListen(state, saveHook);
		} else if (autosave === "beforeunload") {
			addEventListener(autosave, save);
		}

		return state;
	};

	let data = backing.read(ident);
	return data instanceof Promise ? data.then(finish) : finish(data);
}
export let createStore = _createStore;

export let saveAllStores = () => {
	delegates.forEach((cb) => cb());
};
