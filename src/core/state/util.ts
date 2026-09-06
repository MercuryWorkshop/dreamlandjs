import { ObjectProp } from "../utils";

// these types are way too complicated. typescript do better

export interface StateListenerNode<Val extends object, Idx> {
	_value: WeakRef<Val>;
	_index: Idx;
	_next?: StateListenerNode<Val, Idx>;
}

type ListenerValue<Node> =
	NonNullable<Node> extends StateListenerNode<infer Val, any> ? Val : never;
type ListenerIndex<Node> =
	NonNullable<Node> extends StateListenerNode<any, infer Idx> ? Idx : never;

type ListenerKeys<Obj> = {
	[K in keyof Obj & ObjectProp]: Obj[K] extends
		| StateListenerNode<any, any>
		| undefined
		? K
		: never;
}[keyof Obj & ObjectProp];

type WalkStateListeners = <Obj extends object, Key extends ListenerKeys<Obj>>(
	drop: (
		ref: NoInfer<ListenerValue<Obj[Key]>>,
		index: NoInfer<ListenerIndex<Obj[Key]>>
	) => boolean | void,
	object: Obj,
	key: Key
) => void;

export let walkStateListeners: WalkStateListeners = <Val extends object, Idx>(
	drop: (ref: Val, index: Idx) => boolean | void,
	object: Partial<Record<ObjectProp, StateListenerNode<Val, Idx>>>,
	key: ObjectProp
) => {
	let prev: StateListenerNode<Val, Idx> | undefined,
		current = object[key],
		val: Val | undefined;
	while (current) {
		if ((val = current._value.deref()) && !drop(val, current._index)) {
			prev = current;
		} else if (prev) {
			prev._next = current._next;
		} else if (object[key] === current) {
			object[key] = current._next;
		}
		current = current._next;
	}
};
