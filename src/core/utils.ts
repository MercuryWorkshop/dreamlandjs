export let fatal = () => {
	throw new Error("dl");
};

export let deepMerge = (target: any, source: any): any => {
	for (let key in source) {
		if (source[key] instanceof Object && key in target) {
			Object.assign(source[key], deepMerge(target[key], source[key]));
		}
	}

	return Object.assign(target || {}, source);
};
