import { ObjectProp } from "../utils";
import { Pointer } from "./pointers";

export interface StateListenerNode {
	_pointer: WeakRef<Pointer<any>>;
	_index: number | undefined;
	_next?: StateListenerNode;
}

export let walkStateListeners = (
	pred: (n: StateListenerNode) => any,
	object: any,
	key: ObjectProp
): StateListenerNode[] => {
	let prev: StateListenerNode | undefined,
		current = object[key],
		arr = [];
	while (current) {
		if (pred(current)) {
			arr.push(current);
			prev = current;
		} else if (prev) {
			prev._next = current._next;
		} else {
			object[key] = current._next;
		}
		current = current._next;
	}
	return arr;
};
