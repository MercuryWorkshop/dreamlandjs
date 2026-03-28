import { Stateful, createState, isStateful, stateListen } from "dreamland/core";

let DLS_TY = "__dls_ty";
let LOCALSTORAGE = globalThis.localStorage || {};

export let serializeState = (state: Stateful<any>): any => {
	let set = new Set([state]);
	return JSON.stringify(state, (_, v) => {
		if (set.has(v)) return v;

		if (isStateful(v)) {
			set.add(v);
			return { [DLS_TY]: "s", v };
		}

		return v;
	});
};

export let deserializeState = (saved: any): Stateful<any> => {
	return createState(
		JSON.parse(saved, (_, v) => {
			if (v && typeof v === "object" && DLS_TY in v) {
				if (v[DLS_TY] == "s") {
					return createState(v.v);
				}
			}
			return v;
		})
	);
};

export type StoreSyncBacking = {
	read: (ident: string) => string | undefined;
	write: (ident: string, data: string) => void;
};
export type StoreAsyncBacking = {
	read: (ident: string) => Promise<string | undefined>;
	write: (ident: string, data: string) => Promise<void>;
};
export type StoreSyncOptions = {
	ident: string;
	backing: "localstorage" | StoreSyncBacking | StoreAsyncBacking;
	autosave: "auto" | "manual" | "beforeunload";
};
export type StoreAsyncOptions = {
	ident: string;
	backing: StoreAsyncBacking;
	autosave: "auto" | "manual" | "beforeunload";
};

let saveDelegates: (() => void)[] = [];

function _createStore<T extends object>(
	target: T,
	options: StoreAsyncOptions
): Promise<Stateful<T>>;
function _createStore<T extends object>(
	target: T,
	options: StoreSyncOptions
): Stateful<T>;
function _createStore<T extends object>(
	target: T,
	{ ident, backing, autosave }: StoreAsyncOptions | StoreSyncOptions
): Stateful<T> | Promise<Stateful<T>> {
	ident = "dls-" + ident;

	if (backing === "localstorage") {
		backing = {
			read: (ident) => LOCALSTORAGE[ident],
			write: (ident, data) => (LOCALSTORAGE[ident] = data),
		};
	}

	let isAuto = autosave === "auto";
	let last = "";
	let saving: Promise<void> | undefined;
	let asyncSave = async () => {
		await saving;

		let serialized = serializeState(target);
		if (serialized === last) return;
		dev: {
			console.info("[dreamland.js]: saving " + ident);
		}
		await backing.write(ident, serialized);
		last = serialized;
	};
	let save = () => {
		saving = asyncSave();
	};

	let saveHook = (value: any) => {
		if (isStateful(value) && isAuto) stateListen(value, saveHook);
		save();
	};

	let deepMerge = (target: object, source: any) => {
		for (let key in source) {
			let val = source[key];
			if (isStateful(val) && isAuto) stateListen(val, saveHook);
			if (val instanceof Object && key in target) {
				Object.assign(val, deepMerge((target as any)[key], val));
			}
		}

		Object.assign(target, source);
	};

	let finish = (data?: string): Stateful<T> => {
		if (data) {
			deepMerge(target, deserializeState(data));
		}

		let state = createState(target);
		saveDelegates.push(save);

		if (isAuto) {
			stateListen(state, saveHook);
		} else if (autosave === "beforeunload") {
			globalThis?.addEventListener(autosave, save);
		}

		return state;
	};

	let data = backing.read(ident);
	return data instanceof Promise ? data.then(finish) : finish(data);
}
export let createStore = _createStore;

export let saveAllStores = () => {
	saveDelegates.forEach((cb) => cb());
};
