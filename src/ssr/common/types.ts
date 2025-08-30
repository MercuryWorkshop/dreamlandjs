export type SsrValue = number /* JSON serialized value in SsrData */ | {
	t: "m" /* map */ | "o" /* object */,
	v: SsrObject,
} | {
	t: "s" /* set */,
	v: SsrValue[] /* values index */,
} | {
	t: "p" /* pointer */,
	v: SsrPointer,
};
export type SsrPointer = SsrPointer[] | { v: SsrValue /* values index */ };
export type SsrObject = [number /* keys index */, SsrValue /* values index */][];

export type Node = SsrObject | [number, number] /* text/comment node, 1st number is parent element's ssr id, 2nd is child index */;

export interface SsrData {
	k /* keys */: string[],
	v /* values */: string[],
	n /* nodes */: Record<number, Node>;
	i /* idents */: Record<number, string>;
}
