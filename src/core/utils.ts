import { ASSIGN } from "./consts";

export let fatal = () => {
	throw new Error("dl");
};

export let deepMerge = (target: object, source: any) => {
	for (let key in source) {
		if (source[key] instanceof Object && key in target) {
			ASSIGN(source[key], deepMerge(target[key], source[key]));
		}
	}

	ASSIGN(target, source);
};
