export let [
	// dl
	DREAMLAND,
	NO_CHANGE,
	// selectorParser
	COMMA_TOKEN,
	COMBINATOR_TOKEN,
	ID_TOKEN,
	CLASS_TOKEN,
	PSEUDO_ELEMENT_TOKEN,
	PSEUDO_CLASS_TOKEN,
	UNIVERSAL_TOKEN,
	ATTRIBUTE_TOKEN,
	TYPE_TOKEN,
] = Array.from(Array(11), Symbol);
export let MAP = (x) => new Map(x);
export let WEAKMAP = () => new WeakMap();
