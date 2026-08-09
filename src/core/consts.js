export let [
	// dl
	DREAMLAND,
	NO_CHANGE,
	// brand key on Stateful (state/state.ts). the name is historical -- it used to
	// double as the selector tokenizer's comma token, which no longer exists
	COMMA_TOKEN,
] = Array.from(Array(3), Symbol);
export let MAP = /*@__NO_SIDE_EFFECTS__*/ (x) => new Map(x);
export let WEAKMAP = () => new WeakMap();
