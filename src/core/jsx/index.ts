import { DREAMLAND, VNODE } from "../consts";
import { VNode } from "./vdom";

// jsx definitions
import "./jsx";

export { render, VNode, Component } from "./vdom";

function jsxFactory(
  type: any,
  props: { [index: string]: any } | null,
  ...children: (VNode | string)[]
): VNode {
  dev: {
    if (!["string", "function"].includes(typeof type))
      throw "invalid component";
  }

  return {
    [DREAMLAND]: VNODE,
    _init: type,
    _children: children,
    _props: props,
  };
}

export let h = jsxFactory;
