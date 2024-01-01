declare namespace JSX {
  export type IntrinsicElements = { [index: string]: any };
}

declare function h(
  type: string,
  props: { [index: string]: any } | null,
  ...children: (HTMLElement | string)[]
): Node;

type AliceJSReferenceSink = { readonly __symbol: unique symbol };

declare function use(sink: any, mapping?: (...args: any[]) => any): AliceJSReferenceSink;

type Stateful<T> = T & { readonly symbol: unique symbol };


declare function stateful<T>(target: T): Stateful<T>;

declare function handle(references: AliceJSReferenceSink, callback: (value: any) => void): void;

declare function css(strings: TemplateStringsArray, ...values: any): string;
declare var styled: { new: typeof css };
