declare namespace JSX {
  export type IntrinsicElements = { [index: string]: any };
}

declare function h(
  type: string,
  props?: { [index: string]: any } | null,
  ...children: (HTMLElement | string)[]
): Node;

type AliceJSReferenceSink<T> = { readonly __symbol: unique symbol, readonly __signature: T };

declare function use<T>(sink: T | any, mapping?: (...args: any[]) => any): AliceJSReferenceSink<T>;
declare function useValue<T>(sink: AliceJSReferenceSink<T>): T;

type Stateful<T> = T & { readonly symbol: unique symbol };


declare function stateful<T>(target: T): Stateful<T>;

declare function handle<T>(references: AliceJSReferenceSink<T>, callback: (value: T) => void): void;

declare function css(strings: TemplateStringsArray, ...values: any): string;
declare function rule(strings: TemplateStringsArray, ...values: any): string;
declare var styled: { new: typeof css, rule: typeof rule };

type DLCSS = string;

interface Element {
  $: DLComponent<any>
}

type DLComponent<T> = {
  css: DLCSS,
  root: Element,
  children: Element[],
} & T;
