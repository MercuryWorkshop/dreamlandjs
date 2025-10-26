import { Pointer } from "./state/pointers";
import { node } from "./jsx/dom";

export type ObjectProp = string | symbol;

export let isNode = (el: any): el is Node => el instanceof node;
export let isArray = (val: any): val is Array<any> => val instanceof Array;
export let isBasePtr = (val: any): val is Pointer<any> =>
	val instanceof Pointer;

export let fatal = () => {
	throw new Error("dl");
};

// https://en.wikipedia.org/wiki/Longest_increasing_subsequence#Efficient_algorithms
// we're using strings as indices because of `in`. we don't really care if it's a string or a number since it's only gonna be indexing someting
export let findLIS = (arr: number[]): number[] => {
	// M[i]: index of the smallest tail of the LIS with length i+1
	let tails: string[] = [0 as any as string];
	// P[i]: index of the value before the tail of the LIS with length i+1
	let predecessors: string[] = [];
	// L: length of the longest subsequence found so far
	let longest: number = 1;

	let out: number[] = [];
	let currentIndex: string;

	for (let i in arr) {
		let lo = 1;
		let hi = longest + 1;
		let mid: number;
		let newLongest: number;

		while (lo < hi) {
			mid = lo + Math.floor((hi - lo) / 2);
			if (arr[tails[mid]] >= arr[i]) hi = mid;
			else lo = mid + 1;
		}

		newLongest = lo;
		predecessors[i] = tails[newLongest - 1];
		tails[newLongest] = i;
		if (newLongest > longest) longest = newLongest;
	}

	currentIndex = tails[longest];

	for (let j = longest - 1; j >= 0; j--) {
		out[j] = arr[currentIndex];
		currentIndex = predecessors[currentIndex];
	}
	return out;
};
