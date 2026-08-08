export type ObjectProp = string | symbol;

export let deref = <T extends object>(x: WeakRef<T>): T | undefined =>
	x.deref();

export let fatal = () => {
	throw new Error("dl");
};

// https://en.wikipedia.org/wiki/Longest_increasing_subsequence#Efficient_algorithms
export let findLIS = (arr: number[]): number[] => {
	let len = arr.length;
	let i = 1;

	// an already-increasing sequence is its own LIS. this is by far the common
	// case -- a list that got patched in place but never reordered -- and bailing
	// here is ~20x faster than searching for an answer we already know
	// NOTE: this aliases the input rather than copying it. nothing mutates the
	// result today, and copying would defeat the point
	while (i < len && arr[i - 1] < arr[i]) i++;
	if (i >= len) return arr;

	// M[i]: index of the smallest tail of the LIS with length i
	let tails: number[] = [];
	// P[i]: index of the value before the tail of the LIS with length i
	let predecessors: number[] = [];
	// L: length of the longest subsequence found so far
	let longest: number = 0;

	let out: number[] = [];
	let currentIndex: number;

	// this has to be a numeric loop: `for..in` yields string keys, which drops
	// tails/predecessors out of their packed representation and costs ~3x
	for (i = 0; i < len; i++) {
		let lo = 1;
		let hi = longest + 1;
		let mid: number;
		let newLongest: number;

		while (lo < hi) {
			mid = (lo + hi) >> 1;
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
