import { Pointer } from "./state/pointers";
import { node } from "./jsx/dom";

export let isNode = (el: any): el is Node => el instanceof node;
export let isArray = (val: any): val is Array<any> => val instanceof Array;
export let isBasePtr = (val: any): val is Pointer<any> =>
	val instanceof Pointer;

export let fatal = () => {
	throw new Error("dl");
};
