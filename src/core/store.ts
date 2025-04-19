import {
	createState,
	isBasePtr,
	isStateful,
	Stateful,
	stateListen,
} from "./state";

let delegates = [];

export function createStore<T extends Object>(
	target: T,
	options: {
		ident: string;
		backing:
			| "localstorage"
			| {
					read: (ident: string) => string;
					write: (ident: string, data: string) => void;
			  };
		autosave: "auto" | "manual" | "beforeunload";
	}
): Stateful<T> {
	let { ident, backing, autosave } = options;
	let read: (ident: string) => string,
		write: (ident: string, data: string) => void;
	if (typeof backing === "string") {
		switch (backing) {
			case "localstorage":
				read = (ident) => localStorage.getItem(ident);
				write = (ident, data) => {
					localStorage.setItem(ident, data);
				};
				break;
			default:
				dev: {
					throw "Unknown store type: " + backing;
				}
		}
	} else {
		({ read, write } = backing);
	}

	let save = () => {
		dev: {
			console.info("[dreamland.js]: saving " + ident);
		}

		// stack gets filled with "pointers" representing unique objects
		// this is to avoid circular references

		let serstack = {};
		let vpointercount = 0;

		let ser = (tgt: any) => {
			let obj = {
				stateful: isStateful(tgt),
				values: {},
			};
			let i = vpointercount++;
			serstack[i] = obj;

			for (let key in tgt) {
				let value = tgt[key];

				if (isBasePtr(value)) continue; // i don"t think we should be serializing pointers?
				switch (typeof value) {
					case "string":
					case "number":
					case "boolean":
					case "undefined":
						// primitives, serialize as strings
						obj.values[key] = JSON.stringify(value);
						break;

					case "object":
						if (value instanceof Array) {
							obj.values[key] = value.map((v) => {
								if (typeof v === "object") {
									return ser(v);
								} else {
									return JSON.stringify(v);
								}
							});
							break;
						} else if (value === null) {
							obj.values[key] = "null";
						} else {
							dev: {
								if (value.__proto__ === Object.prototype) {
									throw "Only plain objects can be serialized in stores";
								}
							}

							// if it's not a primitive, store it as a number acting as a pointer
							obj.values[key] = ser(value);
						}
						break;

					case "symbol":
					case "function":
					case "bigint":
						dev: {
							throw "Unsupported type: " + typeof value;
						}
				}
			}

			return i;
		};
		ser(target);

		let string = JSON.stringify(serstack);
		write(ident, string);
	};

	let autohook = (target: any, value: any) => {
		if (isStateful(value)) {
			stateListen(value, (_prop, value) => autohook(target, value));
		}
		save();
	};

	let destack = JSON.parse(read(ident));
	if (destack) {
		let objcache = {};

		let de = (i: any) => {
			if (objcache[i]) return objcache[i];
			let obj = destack[i];
			let tgt = {};
			for (let key in obj.values) {
				let value = obj.values[key];
				if (typeof value === "string") {
					// it's a primitive, easy deser
					tgt[key] = JSON.parse(value);
				} else {
					if (value instanceof Array) {
						tgt[key] = value.map((v) => {
							if (typeof v === "string") {
								return JSON.parse(v);
							} else {
								return de(v);
							}
						});
					} else {
						tgt[key] = de(value);
					}
				}
			}
			if (obj.stateful && autosave == "auto") stateListen(tgt as any, autohook);
			let newobj = obj.stateful ? createState(tgt) : tgt;
			objcache[i] = newobj;
			return newobj;
		};

		// "0" pointer is the root object
		target = de(0);
	}

	delegates.push(save);
	switch (autosave) {
		case "beforeunload":
			addEventListener(autosave, save);
			break;
		case "auto":
			stateListen(target as any, (_prop, value) => autohook(target, value));
			break;
		case "manual":
			break;
		default:
			dev: {
				throw "Unknown autosave type: " + autosave;
			}
	}

	return createState(target);
}

export function saveAllStores() {
	delegates.forEach((cb) => cb());
}
