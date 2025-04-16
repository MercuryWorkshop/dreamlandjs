export const DREAMLAND_INTERNAL: unique symbol;

export abstract class DLBasePointer<T> {
	abstract readonly bound: boolean;

	get value(): T;
	set value(value: T);

	listen(func: (val: T) => void): void;
	$then(func: () => void): void;
	$else(func: () => void): void;

	zip<Ptrs extends ReadonlyArray<DLPointer<any>>>(...pointers: Ptrs): DLPointer<[T, ...{ [Idx in keyof Ptrs]: Ptrs[Idx] extends DLPointer<infer Val> ? Val : never }]>;
}

export class DLPointer<T> extends DLBasePointer<T> {
	readonly bound: false;

	map<U>(func: (val: T) => U): DLPointer<U>;

	bind(): DLBoundPointer<T>;
	clone(): DLPointer<T>;
}
export class DLBoundPointer<T> extends DLBasePointer<T> {
	readonly bound: true;

	map<U>(func: (val: T) => U): DLPointer<U>;
	map<U>(func: (val: T) => U, reverse: (val: U) => T): DLBoundPointer<U>;
}

export type Stateful<T> = T & { [DREAMLAND_INTERNAL]: unknown };
export function $state<T extends Object>(object: T): Stateful<T>;

declare function use<T>(val: T): DLPointer<T>;
