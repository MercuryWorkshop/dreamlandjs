export type SsrValue =
	| number /* JSON serialized value in SsrData */
	| [0 /* map */ | 1 /* object */, SsrObject]
	| [2 /* set */ | 3 /* array */, SsrValue[]]
	| [4 /* pointer */, SsrPointer];
export type SsrPointer = SsrPointer[] | { v: SsrValue /* values index */ };
export type SsrObject = [
	number /* keys index */,
	SsrValue /* values index */,
][];

export type Node =
	| SsrObject
	| [
			number,
			number,
	  ] /* text/comment node, 1st number is parent element's ssr id, 2nd is child index */;

export interface SsrData {
	k /* keys */ : string[];
	v /* values */ : any[];
	n /* nodes */ : Record<number, Node>;
	i /* idents */ : Record<number, string>;
	t /* textFixups */ : [number, number, number][];
}
