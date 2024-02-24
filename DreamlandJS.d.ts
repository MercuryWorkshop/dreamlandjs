declare namespace JSX {
  export type IntrinsicElements = {
    [index: string]: any
  };
  type ElementType = Fragment | string | Component<any, any>;
  type Element = DLElement<any>;

  interface ElementAttributesProperty {
    props: {};
  }
  interface ElementChildrenAttribute {
    children: {};
  }
}

declare function h(
  type: string,
  props?: { [index: string]: any } | null,
  ...children: (HTMLElement | string)[]
): Node;
declare function $if(condition: DLPointer<any> | any, then?: Element, otherwise?: Element): HTMLElement;

type DLPointer<T> = { readonly __symbol: unique symbol, readonly __signature: T };

declare function use<T>(sink: T, mapping?: (arg: T) => any): DLPointer<T>;
declare function useValue<T>(trap: DLPointer<T>): T;

type Stateful<T> = T & { readonly symbol: unique symbol };


declare function stateful<T>(target: T): Stateful<T>;
declare function $state<T>(target: T): Stateful<T>;
declare function $store<T>(target: T, ident: string, backing: "localstorage"): Stateful<T>;

declare function handle<T>(references: DLPointer<T>, callback: (value: T) => void): void;

declare function css(strings: TemplateStringsArray, ...values: any): string;
declare function rule(strings: TemplateStringsArray, ...values: any): string;
declare var styled: { new: typeof css, rule: typeof rule };

type DLCSS = string;

declare var $el: HTMLElement;

type Fragment = { readonly fragment: unique symbol };
declare var Fragment: Fragment;

interface Element {
  $: OuterComponentTypes & { [index: string | symbol]: any }
}

interface DLElement<T> extends Element {
  $: T & OuterComponentTypes
}

type ComponentElement<T extends (...args: any) => any> = ReturnType<T>;

type OuterComponentTypes = {
  root: Element,
  children: Element[],
}
type InnerComponentTypes = {
  css: DLCSS,
  mount?: () => void,
}
type ComponentTypes = OuterComponentTypes & InnerComponentTypes;

type ArrayOrSingular<T extends []> = T | T[keyof T];

type Component<Public, Private, Constructed extends string | symbol | number = never> =
  (
    (
      this: Public & Private & ComponentTypes,
      props: (
        [Constructed] extends [never] ? Public : Omit<Public, Constructed>
      ) &
      {
        children?: ArrayOrSingular<Private extends { children: any } ? Private["children"] : never>
      },
    ) => DLElement<Public>
  )


