import { JSDOM } from 'jsdom';

// simple ssr, no hydration
// no reactivity, but we still have to respect dreamland ideas

export function renderToString(component, props, children) {
  globalThis.h = hSSR;
  globalThis.use = p => p;

  return hSSR(component, props, children).outerHTML;
}

export function hSSR(type, props, ...children) {
  const { document, HTMLElement } = (new JSDOM()).window;

  // if (type == Fragment) return children
  if (typeof type == 'function') {
    const newthis = {};

    for (let key in props) {
      if (key.startsWith("bind:")) {
        const attr = key.slice(5);
        newthis[attr] = props[key];
        continue;
      }

      newthis[key] = props[key];
    }

    const elm = type.apply(newthis);

    elm.setAttribute('data-component', type.name)
    elm.setAttribute('ssr-data-component', type.name)

    return elm
  }

  let el = document.createElement(type);

  for (let child of children) {
    if (typeof child == "object" && child != null && "remove" in child) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(child));
    }
  }

  for (let key in props) {
    let val = props[key];
    if (key == "class") {
      el.className = val;
      continue;
    }

    if (key == "style" && typeof val == "object") {
      for (let skey in val) {
        el.style[skey] = val[skey];
      }
      continue;
    }

    if (key.startsWith("on:")) {
      continue;
    }

    if (key.startsWith("bind:")) {
      let attr = key.slice(5);
      el.setAttribute(attr, val);
    }

    el.setAttribute(key, props[key]);
  }

  return el;
}
