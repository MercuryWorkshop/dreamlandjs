declare namespace JSX {
    export type IntrinsicElements = {
        [index: string]: any
    }
    type ElementType = Fragment | string | Component<any, any, any>
    type Element = DLElement<any>

    interface ElementAttributesProperty {
        props: {}
    }
    interface ElementChildrenAttribute {
        children: {}
    }
}

declare function h(
    type: string | Component<any, any, any>,
    props?: { [index: string]: any } | null,
    ...children: (HTMLElement | string)[]
): Node
declare function $if(
    condition: DLPointer<any> | any,
    then?: Element,
    otherwise?: Element
): HTMLElement

type DLPointer<T> = {
    readonly __symbol: unique symbol
    readonly __signature: T
    readonly value: T
}

declare function use<T>(sink: T): DLPointer<T>
declare function use<R, T>(sink: T, mapping: (arg: T) => R): DLPointer<R>
declare function use(
    template: TemplateStringsArray,
    ...params: any[]
): DLPointer<string>

type Stateful<T> = T & { readonly symbol: unique symbol }

declare function $state<T>(target: T): Stateful<T>

declare function $store<T>(
    target: T,
    options: {
        ident: string
        backing:
            | 'localstorage'
            | { read: () => string; write: (value: string) => void }
        autosave: 'auto' | 'manual' | 'beforeunload'
    }
): Stateful<T>

declare function useChange<T>(
    references: DLPointer<T>[] | DLPointer<T> | T | T[],
    callback: (changedvalue: T) => void
): void

declare function isDLPtr(ptr: any): boolean
declare function isStateful(object: any): boolean

declare function css(strings: TemplateStringsArray, ...values: any): string

type DLCSS = string

declare var $el: HTMLElement

type Fragment = { readonly fragment: unique symbol }
declare var Fragment: Fragment

interface Element {
    $: OuterComponentTypes & { [index: string | symbol]: any }
}

interface DLElement<T> extends HTMLElement {
    $: T & OuterComponentTypes
}

type ComponentElement<T extends (...args: any) => any> = ReturnType<T>
type ComponentType<T extends (...args: any) => any> = ReturnType<T>['$']

type OuterComponentTypes = {
    root: Element
    children: Element[]
}
type InnerComponentTypes = {
    css: DLCSS
    mount?: () => void
}
type ComponentTypes = OuterComponentTypes & InnerComponentTypes

type ArrayOrSingular<T extends []> = T | T[keyof T]

/* start https://stackoverflow.com/questions/50374908/transform-union-type-to-intersection-type */

type Intersect<T> = (T extends any ? ((x: T) => 0) : never) extends ((x: infer R) => 0) ? R : never

type TupleKeys<T extends any[]> = Exclude<keyof T, keyof []>

type Foo<T extends any[]> = {
    [K in TupleKeys<T>]: {foo: T[K]}
}

type Values<T> = T[keyof T]

type Unfoo<T> = T extends { foo: any } ? T["foo"] : never

type IntersectItems<T extends any[]> = Unfoo<Intersect<Values<Foo<T>>>>

/* end https://stackoverflow.com/questions/50374908/transform-union-type-to-intersection-type */

/* start https://stackoverflow.com/questions/52855145/typescript-object-type-to-array-type-tuple */
type LastOf<T> =
  Intersect<T extends any ? () => T : never> extends () => (infer R) ? R : never

type Push<T extends any[], V> = [...T, V];

type TuplifyUnion<T, L = LastOf<T>, N = [T] extends [never] ? true : false> =
  true extends N ? [] : Push<TuplifyUnion<Exclude<T, L>>, L>;

type ObjValueTuple<T, KS extends any[] = TuplifyUnion<keyof T>, R extends any[] = []> =
  KS extends [infer K, ...infer KT]
  ? ObjValueTuple<T, KT, [...R, T[K & keyof T]]>
  : R

/* end https://stackoverflow.com/questions/52855145/typescript-object-type-to-array-type-tuple */

type ObjectAutogenProps<Props> = { [K in keyof Props]: ({ [X in K]: Props[K] | DLPointer<Props[K]> } & { [X in K as `bind:${Extract<K, string>}`]?: never }) | ({ [X in K]?: never } & { [X in K as `bind:${Extract<K, string>}`]: DLPointer<Props[K]> }) };

type AutogenProps<Props> = IntersectItems<ObjValueTuple<ObjectAutogenProps<Props>>>;

type Component<Props = {}, Private = {}, Public = {}> = (
    this: Props & Private & Public & ComponentTypes,
    props: AutogenProps<Props> & {
        children?: ArrayOrSingular<
            Private extends { children: any }
                ? Private['children']
                : Public extends { children: any }
                  ? Public['children']
                  : never
        >
    }
) => DLElement<Props & Public>
