declare global {
	namespace JSX {
		export type IntrinsicElements = {
			[index: string]: any;
		};
		export type ElementType = string;
	}
}

export {};
