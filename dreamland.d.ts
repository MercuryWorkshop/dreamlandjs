declare namespace JSX {
    export type IntrinsicElements = {
        [index: string]: any
    }
    type ElementType = Fragment | string | Component<any, any>
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

declare function use<T>(sink: T, mapping?: (arg: T) => any): DLPointer<T>
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

declare function isDLPtr(ptr: any): boolean;
declare function isStateful(object: any): boolean;

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

type Component<
    Props = {},
    Private = {},
    Public = {}
> = (
    this: Props & Private & Public & ComponentTypes,
    props: Props & {
        children?: ArrayOrSingular<
            Private extends { children: any } ? Private['children'] : never
        >
    }
        &
        {
            [K in keyof Props as `bind:${Extract<K, string>}`]: Props[K]
        }
) => DLElement<Public>
