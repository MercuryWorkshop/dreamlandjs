export let SYMBOL = Symbol;
export let [
	// dl
	DREAMLAND,
	STATEFUL,
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
] = Array.from(Array(12), SYMBOL);
export let TOPRIMITIVE = SYMBOL.toPrimitive;
export let ASSIGN = Object.assign;
export let GLOBAL = globalThis;
