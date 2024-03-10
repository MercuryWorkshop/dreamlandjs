import { assert } from "./asserts";

const Fragment = Symbol();

// We add some extra properties into various objects throughout, better to use symbols and not interfere. this is just a tiny optimization
const [USE_MAPFN, TARGET, PROXY, STEPS, LISTENERS, IF] = [, , , , , ,].fill().map(Symbol);


// whether to return the true value from a stateful object or a "trap" containing the pointer
let __use_trap = false;


// Say you have some code like
//// let state = stateful({
////    a: stateful({
////      b: 1
////    })
//// })
//// let elm = <p>{window.use(state.a.b)}</p>
//
// According to the standard, the order of events is as follows:
// - the getter for window.use gets called, setting __use_trap true
// - the proxy for state.a is triggered and instead of returning the normal value it returns the trap
// - the trap proxy is triggered, storing ["a", "b"] as the order of events
// - the function that the getter of `use` returns is called, setting __use_trap to false and restoring order
// - the JSX factory h() is now passed the trap, which essentially contains a set of pointers pointing to the theoretical value of b
// - with the setter on the stateful proxy, we can listen to any change in any of the nested layers and call whatever listeners registered
// - the result is full intuitive reactivity with minimal overhead
Object.defineProperty(window, "use", {
  get: () => {
    __use_trap = true;
    return (ptr, mapping) => {
      assert(isDLPtr(ptr), "a value was passed into use() that was not part of a stateful context");
      __use_trap = false;
      if (mapping) ptr[USE_MAPFN] = mapping;
      return ptr;
    };
  }
});
Object.assign(window, { isDLPtr, h, stateful, handle, $if, Fragment });

const TRAPS = new Map;
// This wraps the target in a proxy, doing 2 things:
// - whenever a property is accessed, return a "trap" that catches and records accessors
// - whenever a property is set, notify the subscribed listeners
// This is what makes our "pass-by-reference" magic work
function stateful(target, hook) {
  assert(target instanceof Object, "stateful() requires an object");
  target[LISTENERS] = [];
  target[TARGET] = target;

  const proxy = new Proxy(target, {
    get(target, property, proxy) {
      if (__use_trap) {
        let sym = Symbol();
        let trap = new Proxy({
          [TARGET]: target,
          [PROXY]: proxy,
          [STEPS]: [property],
          [Symbol.toPrimitive]: () => sym,
        }, {
          get(target, property) {
            if ([TARGET, PROXY, STEPS, USE_MAPFN, Symbol.toPrimitive].includes(property)) return target[property];
            property = TRAPS.get(property) || property;
            target[STEPS].push(property);
            return trap;
          }
        });
        TRAPS.set(sym, trap);

        return trap;
      }
      return Reflect.get(target, property, proxy);
    },
    set(target, property, val) {
      if (hook) hook(target, property, val);
      let trap = Reflect.set(target, property, val);
      for (const listener of target[LISTENERS]) {
        listener(target, property, val);
      }
      return trap;
    },
  });

  return proxy;
}

let isobj = (o) => o instanceof Object;
function isDLPtr(arr) {
  return isobj(arr) && TARGET in arr
}

function $if(condition, then, otherwise) {
  otherwise ??= document.createTextNode("");
  if (!isDLPtr(condition)) return condition ? then : otherwise;

  return { [IF]: condition, then, otherwise };
}

// This lets you subscribe to a stateful object
function handle(ptr, callback) {
  assert(isDLPtr(ptr), "handle() requires a stateful object");
  assert(typeof callback === "function", "handle() requires a callback function");
  let step, resolvedSteps = [];

  function update() {
    let val = ptr[TARGET];
    for (step of resolvedSteps) {
      val = val[step];
      if (!isobj(val)) break;
    }

    let mapfn = ptr[USE_MAPFN];
    if (mapfn) val = mapfn(val);
    callback(val);
  }

  // inject ourselves into nested objects
  const curry = (target, i) => function subscription(tgt, prop, val) {
    if (prop === resolvedSteps[i] && target === tgt) {
      update();

      if (val instanceof Object) {
        let v = val[LISTENERS];
        if (v && !v.includes(subscription)) {
          v.push(curry(val[TARGET], i + 1));
        }
      }
    }
  };


  // imagine we have a `use(state.a[state.b])`
  // simply recursively resolve any of the intermediate steps until we get to the final value
  // this will "misfire" occassionaly with a scenario like state.a[state.b][state.c] and call the listener more than needed
  // it is up to the caller to not implode
  for (let i in ptr[STEPS]) {
    let step = ptr[STEPS][i];
    if (isobj(step) && step[TARGET]) {
      handle(step, val => {
        resolvedSteps[i] = val;
        update();
      });
      continue;
    }
    resolvedSteps[i] = step;
  }

  let sub = curry(ptr[TARGET], 0);
  ptr[TARGET][LISTENERS].push(sub);

  sub(ptr[TARGET], resolvedSteps[0], ptr[TARGET][resolvedSteps[0]]);
}

function JSXAddFixedWrapper(ptr, cb, $if) {
  let before, appended, first, flag;
  handle(ptr, val => {
    first = appended?.[0];
    if (first)
      before = first.previousSibling || (flag = first.parentNode);
    if (appended)
      appended.forEach(a => a.remove());

    appended = JSXAddChild($if ? (val ? $if.then : $if.otherwise) : val, el => {
      if (before) {
        if (flag) {
          before.prepend(el)
          flag = null;
        }
        else before.after(el);
        before = el;
      }
      else cb(el)
    })
  })
}

// Actual JSX factory. Responsible for creating the HTML elements and all of the *reactive* syntactic sugar
function h(type, props, ...children) {
  if (type == Fragment) return children;
  if (typeof type == "function") {
    // functional components. create the stateful object
    let newthis = stateful(Object.create(type.prototype));

    for (const name in props) {
      const ptr = props[name];
      if (name.startsWith("bind:")) {
        assert(isDLPtr(ptr), "bind: requires a reference pointer from use");

        const propname = name.substring(5);
        if (propname == "this") {
          // todo! support nesting
          ptr[PROXY][ptr[STEPS][0]] = newthis;
        } else {
          // component two way data binding!! (exact same behavior as svelte:bind)
          let isRecursive = false;

          handle(ptr, value => {
            if (isRecursive) {
              isRecursive = false;
              return;
            }
            isRecursive = true;
            newthis[propname] = value
          });
          handle(use(newthis[propname]), value => {
            if (isRecursive) {
              isRecursive = false;
              return;
            }
            isRecursive = true;
            ptr[PROXY][ptr[STEPS][0]] = value;
          });
        }
        delete props[name];
      }
    }
    Object.assign(newthis, props);

    newthis.children = [];
    for (const child of children) {
      JSXAddChild(child, newthis.children.push.bind(newthis.children));
    }

    let elm = type.apply(newthis);
    elm.$ = newthis;
    newthis.root = elm;
    if (newthis.css) {
      elm.classList.add(newthis.css);
      elm.classList.add("self");
    }
    elm.setAttribute("data-component", type.name);
    if (typeof newthis.mount === "function")
      newthis.mount();
    return elm;
  }


  let xmlns = props?.xmlns;
  const elm = xmlns ? document.createElementNS(xmlns, type) : document.createElement(type);


  for (const child of children) {
    let cond = child && !isDLPtr(child) && child[IF];
    let bappend = elm.append.bind(elm);
    if (cond) {
      JSXAddFixedWrapper(cond, bappend, child);
    } else
      JSXAddChild(child, bappend);
  }

  if (!props) return elm;

  function useProp(name, callback) {
    if (!(name in props)) return;
    let prop = props[name];
    callback(prop);
    delete props[name];
  }

  for (const name in props) {
    const ptr = props[name];
    if (name.startsWith("bind:")) {
      assert(isDLPtr(ptr), "bind: requires a reference pointer from use");
      const propname = name.substring(5);
      if (propname == "this") {
        // todo! support nesting
        ptr[PROXY][ptr[STEPS][0]] = elm;
      } else if (propname == "value") {
        handle(ptr, value => elm.value = value);
        elm.addEventListener("change", () => {
          ptr[PROXY][ptr[STEPS][0]] = elm.value;
        })
      } else if (propname == "checked") {
        handle(ptr, value => elm.checked = value);
        elm.addEventListener("click", () => {
          ptr[PROXY][ptr[STEPS][0]] = elm.checked;
        })
      }
      delete props[name];
    }
  }

  useProp("class", classlist => {
    assert(typeof classlist === "string" || classlist instanceof Array, "class must be a string or array");
    if (typeof classlist === "string") {
      elm.className = classlist;
      return;
    }

    if (isDLPtr(classlist)) {
      handle(classlist, classname => elm.className = classname);
      return;
    }

    for (const name of classlist) {
      if (isDLPtr(name)) {
        let oldvalue = null;
        handle(name, value => {
          if (typeof oldvalue === "string") {
            elm.classList.remove(oldvalue);
          }
          elm.classList.add(value);
          oldvalue = value;
        });
      } else {
        elm.classList.add(name);
      }
    }
  });

  // apply the non-reactive properties
  for (const name in props) {
    const prop = props[name];
    if (isDLPtr(prop)) {
      handle(prop, (val) => {
        JSXAddAttributes(elm, name, val);
      });
    } else {
      JSXAddAttributes(elm, name, prop);
    }
  }

  // hack to fix svgs
  if (xmlns)
    elm.innerHTML = elm.innerHTML

  return elm;
}

// glue for nested children
function JSXAddChild(child, cb) {
  let childchild, elms, node;
  if (isDLPtr(child)) {
    JSXAddFixedWrapper(child, cb);
  } else if (child instanceof Node) {
    cb(child);
    return [child];
  } else if (child instanceof Array) {
    elms = [];
    for (childchild of child) {
      elms = elms.concat(JSXAddChild(childchild, cb));
    }
    if (!elms[0]) elms = JSXAddChild("", cb);
    return elms;
  } else {
    node = document.createTextNode(child);
    cb(node);
    return [node];
  }
}

// Where properties are assigned to elements, and where the *non-reactive* syntax sugar goes
function JSXAddAttributes(elm, name, prop) {
  if (typeof prop === "function" && name === "mount") {
    window.$el = elm;
    prop(elm);
    return;
  }

  if (typeof prop === "function" && name.startsWith("on:")) {
    const names = name.substring(3);
    for (const name of names.split("$")) {
      elm.addEventListener(name, (...args) => {
        window.$el = elm;
        prop(...args);
      });
    }
    return;
  }

  elm.setAttribute(name, prop);
}
