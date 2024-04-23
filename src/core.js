import { assert } from './asserts'

import {
    LISTENERS,
    STATEHOOK,
    USE_MAPFN,
    TARGET,
    PROXY,
    STEPS,
    IF,
    cssBoundary,
} from './consts'


// saves a few characters, since document will never change
let doc = document

export const Fragment = Symbol()

// whether to return the true value from a stateful object or a "trap" containing the pointer
let __use_trap = false

// Say you have some code like
//// let state = $state({
////    a: $state({
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
Object.defineProperty(window, 'use', {
    get: () => {
        __use_trap = true
        return (ptr, mapping, ...rest) => {
            /* FEATURE.USESTRING.START */
            if (ptr instanceof Array) return usestr(ptr, mapping, ...rest)
            /* FEATURE.USESTRING.END */
            assert(
                isDLPtr(ptr),
                'a value was passed into use() that was not part of a stateful context'
            )
            __use_trap = false
            if (mapping) ptr[USE_MAPFN] = mapping
            return ptr
        }
    },
})

/* FEATURE.USESTRING.START */
const usestr = (strings, ...values) => {
    __use_trap = false

    let state = $state({})
    const flattened_template = []
    for (const i in strings) {
        flattened_template.push(strings[i])
        if (values[i]) {
            const prop = values[i]

            if (isDLPtr(prop)) {
                const current_i = flattened_template.length
                let oldparsed
                handle(prop, (val) => {
                    flattened_template[current_i] = String(val)
                    let parsed = flattened_template.join('')
                    if (parsed != oldparsed) state.string = parsed
                    oldparsed = parsed
                })
            } else {
                flattened_template.push(String(prop))
            }
        }
    }

    state.string = flattened_template.join('')

    return use(state.string)
}
/* FEATURE.USESTRING.END */

let TRAPS = new Map()
// This wraps the target in a proxy, doing 2 things:
// - whenever a property is accessed, return a "trap" that catches and records accessors
// - whenever a property is set, notify the subscribed listeners
// This is what makes our "pass-by-reference" magic work
export function $state(target) {
    assert(isobj(target), '$state() requires an object')
    target[LISTENERS] = []
    target[TARGET] = target
    let TOPRIMITIVE = Symbol.toPrimitive

    let proxy = new Proxy(target, {
        get(target, property, proxy) {
            if (__use_trap) {
                let sym = Symbol()
                let trap = new Proxy(
                    {
                        [TARGET]: target,
                        [PROXY]: proxy,
                        [STEPS]: [property],
                        [TOPRIMITIVE]: (_) => sym,
                    },
                    {
                        get(target, property) {
                            if (
                                [
                                    TARGET,
                                    PROXY,
                                    STEPS,
                                    USE_MAPFN,
                                    TOPRIMITIVE,
                                ].includes(property)
                            )
                                return target[property]
                            property = TRAPS.get(property) || property
                            target[STEPS].push(property)
                            return trap
                        },
                    }
                )
                TRAPS.set(sym, trap)

                return trap
            }
            return Reflect.get(target, property, proxy)
        },
        set(target, property, val) {
            let trap = Reflect.set(target, property, val)
            for (let listener of target[LISTENERS]) {
                listener(target, property, val)
            }

            /* FEATURE.STORES.START */
            if (target[STATEHOOK])
                target[STATEHOOK](target, property, target[property])
            /* FEATURE.STORES.END */

            return trap
        },
    })

    return proxy
}

let isobj = (o) => o instanceof Object
let isfn = (o) => typeof o === 'function'

export function isStateful(obj) {
    return isobj(obj) && LISTENERS in obj
}

export function isDLPtr(arr) {
    return isobj(arr) && STEPS in arr
}

export function $if(condition, then, otherwise) {
    otherwise ??= doc.createTextNode('')
    if (!isDLPtr(condition)) return condition ? then : otherwise

    return { [IF]: condition, then, otherwise }
}

// This lets you subscribe to a stateful object
export function handle(ptr, callback) {
    assert(isDLPtr(ptr), 'handle() requires a stateful object')
    assert(isfn(callback), 'handle() requires a callback function')
    let step,
        resolvedSteps = []

    function update() {
        let val = ptr[TARGET]
        for (step of resolvedSteps) {
            val = val[step]
            if (!isobj(val)) break
        }

        let mapfn = ptr[USE_MAPFN]
        if (mapfn) val = mapfn(val)
        callback(val)
    }

    // inject ourselves into nested objects
    let curry = (target, i) =>
        function subscription(tgt, prop, val) {
            if (prop === resolvedSteps[i] && target === tgt) {
                update()

                if (isobj(val)) {
                    let v = val[LISTENERS]
                    if (v && !v.includes(subscription)) {
                        v.push(curry(val[TARGET], i + 1))
                    }
                }
            }
        }

    // imagine we have a `use(state.a[state.b])`
    // simply recursively resolve any of the intermediate steps until we get to the final value
    // this will "misfire" occassionaly with a scenario like state.a[state.b][state.c] and call the listener more than needed
    // it is up to the caller to not implode
    for (let i in ptr[STEPS]) {
        let step = ptr[STEPS][i]
        if (isobj(step) && step[TARGET]) {
            handle(step, (val) => {
                resolvedSteps[i] = val
                update()
            })
            continue
        }
        resolvedSteps[i] = step
    }

    let sub = curry(ptr[TARGET], 0)
    ptr[TARGET][LISTENERS].push(sub)

    sub(ptr[TARGET], resolvedSteps[0], ptr[TARGET][resolvedSteps[0]])
}

function JSXAddFixedWrapper(ptr, cb, $if) {
    let before, appended, first, flag
    handle(ptr, (val) => {
        first = appended?.[0]
        if (first) before = first.previousSibling || (flag = first.parentNode)
        if (appended) appended.forEach((a) => a.remove())

        appended = JSXAddChild(
            $if ? (val ? $if.then : $if.otherwise) : val,
            (el) => {
                if (before) {
                    if (flag) {
                        before.prepend(el)
                        flag = null
                    } else before.after(el)
                    before = el
                } else cb(el)
            }
        )
    })
}

// returns a function that sets a reference
// the currying is a small optimization
let curryset = (ptr) => (val) => {
    let next = ptr[PROXY]
    let steps = ptr[STEPS]
    let i = 0
    for (; i < steps.length - 1; i++) {
        next = next[steps[i]]
        if (!isobj(next)) return
    }
    next[steps[i]] = val
}

// Actual JSX factory. Responsible for creating the HTML elements and all of the *reactive* syntactic sugar
export function h(type, props, ...children) {
    if (type == Fragment) return children
    if (typeof type == 'function') {
        // functional components. create the stateful object
        let newthis = $state(Object.create(type.prototype))

        for (let name in props) {
            let ptr = props[name]
            if (name.startsWith('bind:')) {
                assert(
                    isDLPtr(ptr),
                    'bind: requires a reference pointer from use'
                )

                let set = curryset(ptr)
                let propname = name.substring(5)
                if (propname == 'this') {
                    set(newthis)
                } else {
                    // component two way data binding!! (exact same behavior as svelte:bind)
                    let isRecursive = false

                    handle(ptr, (value) => {
                        if (isRecursive) {
                            isRecursive = false
                            return
                        }
                        isRecursive = true
                        newthis[propname] = value
                    })
                    handle(use(newthis[propname]), (value) => {
                        if (isRecursive) {
                            isRecursive = false
                            return
                        }
                        isRecursive = true
                        set(value)
                    })
                }
                delete props[name]
            }
        }
        Object.assign(newthis, props)

        newthis.children = []
        for (let child of children) {
            JSXAddChild(child, newthis.children.push.bind(newthis.children))
        }

        let elm = type.apply(newthis)
        elm.$ = newthis
        newthis.root = elm
        /* FEATURE.CSS.START */
        let cl = elm.classList
        if (newthis.css) {
            cl.add(newthis.css)
        }
        cl.add(cssBoundary)
        /* FEATURE.CSS.END */
        elm.setAttribute('data-component', type.name)
        if (typeof newthis.mount === 'function') newthis.mount()
        return elm
    }

    let xmlns = props?.xmlns
    let elm = xmlns ? doc.createElementNS(xmlns, type) : doc.createElement(type)

    for (let child of children) {
        let cond = child && !isDLPtr(child) && child[IF]
        let bappend = elm.append.bind(elm)
        if (cond) {
            JSXAddFixedWrapper(cond, bappend, child)
        } else JSXAddChild(child, bappend)
    }

    if (!props) return elm

    let useProp = (name, callback) => {
        if (!(name in props)) return
        let prop = props[name]
        callback(prop)
        delete props[name]
    }

    for (let name in props) {
        let ptr = props[name]
        if (name.startsWith('bind:')) {
            assert(isDLPtr(ptr), 'bind: requires a reference pointer from use')
            let propname = name.substring(5)

            // create the function to set the value of the pointer
            let set = curryset(ptr)
            if (propname == 'this') {
                set(elm)
            } else if (propname == 'value') {
                handle(ptr, (value) => (elm.value = value))
                elm.addEventListener('change', () => set(elm.value))
            } else if (propname == 'checked') {
                handle(ptr, (value) => (elm.checked = value))
                elm.addEventListener('click', () => set(elm.checked))
            }
            delete props[name]
        }
        if (name == 'style' && isobj(ptr)) {
            for (let key in ptr) {
                let prop = ptr[key]
                if (isDLPtr(prop)) {
                    handle(prop, (value) => (elm.style[key] = value))
                } else {
                    elm.style[key] = prop
                }
            }
            delete props[name]
        }
    }

    useProp('class', (classlist) => {
        assert(
            typeof classlist === 'string' || classlist instanceof Array,
            'class must be a string or array'
        )
        if (typeof classlist === 'string') {
            elm.setAttribute('class', classlist)
            return
        }

        if (isDLPtr(classlist)) {
            handle(classlist, (classname) =>
                elm.setAttribute('class', classname)
            )
            return
        }

        for (let name of classlist) {
            if (isDLPtr(name)) {
                let oldvalue = null
                handle(name, (value) => {
                    if (typeof oldvalue === 'string') {
                        elm.classList.remove(oldvalue)
                    }
                    elm.classList.add(value)
                    oldvalue = value
                })
            } else {
                elm.classList.add(name)
            }
        }
    })

    // apply the non-reactive properties
    for (let name in props) {
        let prop = props[name]
        if (isDLPtr(prop)) {
            handle(prop, (val) => {
                JSXAddAttributes(elm, name, val)
            })
        } else {
            JSXAddAttributes(elm, name, prop)
        }
    }

    // hack to fix svgs
    if (xmlns) elm.innerHTML = elm.innerHTML

    return elm
}

// glue for nested children
function JSXAddChild(child, cb) {
    let childchild, elms, node
    if (isDLPtr(child)) {
        JSXAddFixedWrapper(child, cb)
    } else if (child instanceof Node) {
        cb(child)
        return [child]
    } else if (child instanceof Array) {
        elms = []
        for (childchild of child) {
            elms = elms.concat(JSXAddChild(childchild, cb))
        }
        if (!elms[0]) elms = JSXAddChild('', cb)
        return elms
    } else {
        node = doc.createTextNode(child)
        cb(node)
        return [node]
    }
}

// Where properties are assigned to elements, and where the *non-reactive* syntax sugar goes
function JSXAddAttributes(elm, name, prop) {
    if (name.startsWith('on:')) {
        assert(typeof prop === 'function', 'on: requires a function')
        let names = name.substring(3)
        for (let name of names.split('$')) {
            elm.addEventListener(name, (...args) => {
                self.$el = elm
                prop(...args)
            })
        }
        return
    }

    elm.setAttribute(name, prop)
}
