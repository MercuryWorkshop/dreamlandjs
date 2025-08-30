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

export interface SsrData {
	k /* keys */: string[],
	v /* values */: string[],
	s /* state */: Record<number, SsrObject>;

	i /* idents */: Record<number, string>;
}
