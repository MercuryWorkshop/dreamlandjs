import { KeyStore, SerializedState, PrimStore, RefStore } from "./serialize";

export type Node = [
	number,
	number,
	string?,
] /* text/comment node, 1st number is parent element's ssr id, 2nd is child index, possible debug string */;

export interface SsrData {
	k /* keys */: KeyStore;
	v /* values */: PrimStore;
	r /* refs */: RefStore;
	d /* data */: Record<number, SerializedState>;
	n /* nodes */: Record<number, Node>;
	t /* textFixups */: [number, number, number][];
	p /* pruned element ranges (dev only) */?: (number | [number, number])[];
	c /* css idents detected (dev only) */?: string[];
}
