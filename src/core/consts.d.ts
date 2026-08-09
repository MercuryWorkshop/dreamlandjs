export const DREAMLAND: unique symbol;
export const NO_CHANGE: unique symbol;

export const COMMA_TOKEN: unique symbol;

export const MAP: <K, V>(x?: [K, V][]) => Map<K, V>;
export const WEAKMAP: <K extends object, V>() => WeakMap<K, V>;
