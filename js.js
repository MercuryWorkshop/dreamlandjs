// whether to return the true value from a stateful object or a "trap" containing the pointer
let __use_trap = false;

// We add some extra properties into various objects throughout, better to use symbols and not interfere
let USE_MAPFN = Symbol();

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
      __use_trap = false;
      if (mapping) ptr[USE_MAPFN] = mapping;
      return ptr;
    };
  }
});
Object.assign(window, { isDLPtr, h, stateful, handle, useValue });


const TARGET = Symbol();
const PROXY = Symbol();
const STEPS = Symbol();
const LISTENERS = Symbol();
const TRAPS = new Map;
// This wraps the target in a proxy, doing 2 things:
// - whenever a property is accessed, return a "trap" that catches and records accessors
// - whenever a property is set, notify the subscribed listeners
// This is what makes our "pass-by-reference" magic work
export function stateful(target) {
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
      let trap = Reflect.set(target, property, val);
      for (const listener of target[LISTENERS]) {
        listener(target, property, val);
      }
      return trap;
    },
  });

  return proxy;
}

export function isDLPtr(arr) {
  return arr instanceof Object && TARGET in arr
}

// This lets you subscribe to a stateful object
export function handle(ptr, callback) {
  const resolvedSteps = [];

  function update() {
    let val = ptr[TARGET];
    for (const step of resolvedSteps) {
      val = val[step];
      if (typeof val !== "object") break;
    }

    let mapfn = ptr[USE_MAPFN];
    if (mapfn) val = mapfn(val);
    callback(val);
  }

  // inject ourselves into nested objects
  const curry = (target, i) => function subscription(tgt, prop, val) {
    if (prop === resolvedSteps[i] && target === tgt) {
      update();

      if (typeof val === "object") {
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
    if (typeof step === "object" && step[TARGET]) {
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

export function useValue(references) {
  let reference = references[references.length - 1];
  return reference.proxy[reference.property];
}

// Actual JSX factory. Responsible for creating the HTML elements and all of the *reactive* syntactic sugar
export function h(type, props, ...children) {
  if (typeof type === "function") {
    let newthis = stateful(Object.create(type.prototype));

    for (const name in props) {
      const ptr = props[name];
      if (isDLPtr(ptr) && name.startsWith("bind:")) {

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
    if (typeof newthis.mount === "function")
      newthis.mount();
    return elm;
  }


  const elm = document.createElement(type);

  for (const child of children) {
    JSXAddChild(child, elm.appendChild.bind(elm));
  }

  if (!props) return elm;

  function useProp(name, callback) {
    if (!(name in props)) return;
    let prop = props[name];
    callback(prop);
    delete props[name];
  }

  // if/then/else syntax
  useProp("if", condition => {
    let thenblock = props["then"];
    let elseblock = props["else"];

    if (isDLPtr(condition)) {
      if (thenblock) elm.appendChild(thenblock);
      if (elseblock) elm.appendChild(elseblock);

      handle(condition, val => {
        if (thenblock) {
          if (val) {
            thenblock.style.display = "";
            if (elseblock) elseblock.style.display = "none";
          } else {
            thenblock.style.display = "none";

            if (elseblock) elseblock.style.display = "";
          }
        } else {
          if (val) {
            elm.style.display = "";
          } else {
            elm.style.display = "none";
          }
        }
      });
    } else {
      if (thenblock) {
        if (condition) {
          elm.appendChild(thenblock);
        } else if (elseblock) {
          elm.appendChild(elseblock);
        }
      } else {
        if (condition) {
          elm.appendChild(thenblock);
        } else if (elseblock) {
          elm.appendChild(elseblock);
        } else {
          elm.style.display = "none";
          return document.createTextNode("");
        }
      }
    }

    delete props["then"];
    delete props["else"];
  });

  if ("for" in props && "do" in props) {
    const predicate = props["for"];
    const closure = props["do"];

    if (isDLPtr(predicate)) {
      const __elms = [];
      let lastpredicate = [];
      handle(predicate, val => {
        if (
          val.length &&
          val.length == lastpredicate.length
        ) {
          let i = 0;
          for (const index in val) {
            if (
              deepEqual(val[index], lastpredicate[index])
            ) {
              continue;
            }
            const part = closure(val[index], index, val);
            elm.replaceChild(part, __elms[i]);
            __elms[i] = part;

            i += 1;
          }
          lastpredicate = JSON.parse(JSON.stringify(val));
        } else {
          for (const part of __elms) {
            part.remove();
          }
          for (const index in val) {
            const value = val[index];

            const part = closure(value, index, val);
            if (part instanceof HTMLElement) {
              __elms.push(part);
              elm.appendChild(part);
            }
          }

          lastpredicate = JSON.parse(JSON.stringify(val));
        }
      });
    } else {
      for (const index in predicate) {
        const value = predicate[index];

        const part = closure(value, index, predicate);
        if (part instanceof Node) elm.appendChild(part);

      }
    }

    delete props["for"];
    delete props["do"];
  }


  // insert an element at the end
  useProp("after", callback => {
    JSXAddChild(callback());
  })

  for (const name in props) {
    const ptr = props[name];
    if (isDLPtr(ptr) && name.startsWith("bind:")) {
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

  return elm;
}

// glue for nested children
function JSXAddChild(child, cb) {
  if (isDLPtr(child)) {
    let appended = [];
    handle(child, (val) => {
      if (appended.length > 1) {
        // this is why we don't encourage arrays (jank)
        appended.forEach(n => n.remove());
        appended = JSXAddChild(val, cb);
      } else if (appended.length > 0) {
        let old = appended[0];
        appended = JSXAddChild(val, cb);
        if (appended[0]) {
          old.replaceWith(appended[0])
        } else {
          old.remove();
        }
      } else {
        appended = JSXAddChild(val, cb);
      }
    });
  } else if (child instanceof Node) {
    cb(child);
    return [child];
  } else if (child instanceof Array) {
    let elms = [];
    for (const childchild of child) {
      elms = elms.concat(JSXAddChild(childchild, cb));
    }
    return elms;
  } else {
    let node = document.createTextNode(child);
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

function deepEqual(object1, object2) {
  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    const val1 = object1[key];
    const val2 = object2[key];
    const areObjects = isObject(val1) && isObject(val2);
    if (
      (areObjects && !deepEqual(val1, val2)) ||
      (!areObjects && val1 !== val2)
    ) {
      return false;
    }
  }

  return true;
}

function isObject(object) {
  return object != null && typeof object === "object";
}
