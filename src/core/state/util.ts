import { ObjectProp } from "../utils";
import { Pointer } from "./pointers";

export interface StateListenerNode {
	_pointer: WeakRef<Pointer<any>>;
	_index: number | undefined;
	_next?: StateListenerNode;
}

export let walkStateListeners = (
	drop: (ptr: Pointer<any>, index: number | undefined) => boolean | void,
	object: any,
	key: ObjectProp
) => {
	let prev: StateListenerNode | undefined,
		current = object[key],
		val: Pointer<any> | undefined;
	while (current) {
		if ((val = current._pointer.deref()) && !drop(val, current._index)) {
			prev = current;
		} else if (prev) {
			prev._next = current._next;
		} else if (object[key] === current) {
			// drop only holds when nothing was prepended while we were dispatching;
			// otherwise leave the dead node linked and let the next walk prune it,
			// rather than clobbering the new head
			object[key] = current._next;
		}
		current = current._next;
	}
};
