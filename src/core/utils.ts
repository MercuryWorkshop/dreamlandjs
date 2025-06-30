export let fatal = () => {
	throw new Error("dl");
};

export const deepMerge = (target: any, source: any): any => {
	for (const key in source) {
		if (source[key] instanceof Object && key in target) {
			Object.assign(source[key], deepMerge(target[key], source[key]));
		}
	}

	return Object.assign(target || {}, source);
};