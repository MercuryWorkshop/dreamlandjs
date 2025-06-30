import {
	createState,
	isBasePtr,
	isStateful,
	Stateful,
	stateListen,
} from "./state";
import { deepMerge } from "./utils";

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

export function createStore<T extends Object>(
	target: T,
	options: {
		ident: string;
		backing: StoreAsyncBacking;
		autosave: "auto" | "manual" | "beforeunload";
	}
): Promise<Stateful<T>>;
export function createStore<T extends Object>(
	target: T,
	options: {
		ident: string;
		backing: "localstorage" | StoreSyncBacking;
		autosave: "auto" | "manual" | "beforeunload";
	}
): Stateful<T>;
export function createStore<T extends Object>(
	target: T,
	options: {
		ident: string;
		backing: "localstorage" | StoreSyncBacking | StoreAsyncBacking;
		autosave: "auto" | "manual" | "beforeunload";
	}
): Stateful<T> | Promise<Stateful<T>> {
	let { ident, backing, autosave } = options;

	let read: (ident: string) => Promise<string | null> | string | null;
	let write: (ident: string, data: string) => Promise<void>;

	if (backing === "localstorage") {
		read = (ident) => LOCALSTORAGE[ident] || null;
		write = async (ident, data) => (LOCALSTORAGE[ident] = data) as any;
	} else {
		read = (ident) => backing.read(ident);
		write = async (ident, data) => await backing.write(ident, data);
	}

	let last = "";
	let saving = Promise.all([]) as unknown as Promise<void>;
	let asyncSave = async () => {
		await saving;

		let stack = [];

		let ser = (target: object) => {
			let serialized = {
				s /*stateful*/: isStateful(target),
				v /*values*/: {},
			};
			let i = stack.length;
			stack[i] = serialized;

			let serOne = (target: any) => {
				if (typeof target === "object") {
					if (target instanceof Array) {
						return target.map(serOne);
					} else if (target === null) {
						return "null";
					} else {
						dev: {
							if (target.__proto__ === Object.prototype) {
								throw "Only plain objects can be serialized in stores";
							}
						}

						return ser(target);
					}
				} else {
					return JSON.stringify(target);
				}
			};

			for (let key in target) {
				if (isBasePtr(key)) {
					dev: {
						console.warn(
							`[dreamland.js]: skipping pointer ${key} while saving ${ident}`
						);
					}
					continue;
				}

				serialized.v[key] = serOne(target[key]);
			}

			return i;
		};

		ser(target);
		let serialized = JSON.stringify(stack);

		if (serialized === last) return;
		dev: {
			console.info("[dreamland.js]: saving " + ident);
		}
		await write(ident, serialized);
	};
	let save = () => {
		saving = asyncSave();
	};

	let saveHook = (_key: any, value: any) => {
		if (isStateful(value)) stateListen(value, saveHook);
		save();
	};

	let finish = (data: string): Stateful<T> => {
		let stack = JSON.parse(data);
		if (stack) {
			let cache = Array(stack.length);

			let de = (i: number) => {
				if (cache[i]) return cache[i];
				let serialized = stack[i];
				let target = {};

				let deOne = (val: any) => {
					if (typeof val === "string") {
						return JSON.parse(val);
					} else if (val instanceof Array) {
						return val.map(deOne);
					} else {
						return de(val);
					}
				};

				for (let key in serialized.v) {
					target[key] = deOne(serialized.v[key]);
				}

				let state = serialized.s ? createState(target) : target;
				if (isStateful(state) && autosave === "auto")
					stateListen(state as any, saveHook);
				cache[i] = state;
				return state;
			};

			target = deepMerge(target, de(0));
		}

		let state = createState(target);
		delegates.push(save);

		if (autosave === "auto") {
			stateListen(state, saveHook);
		} else if (autosave === "beforeunload") {
			addEventListener(autosave, save);
		}

		return state;
	};

	let data = read(ident);
	return data instanceof Promise ? data.then(finish) : finish(data);
}

export let saveAllStores = () => {
	delegates.forEach((cb) => cb());
};
