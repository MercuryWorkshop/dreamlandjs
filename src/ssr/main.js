import { JSDOM } from 'jsdom'

// simple ssr, no hydration
// no reactivity, but we still have to respect dreamland ideas

function genuid() {
    return `${Array(4)
        .fill(0)
        .map(() => {
            return Math.floor(Math.random() * 36).toString(36)
        })
        .join('')}`
}

export function renderToString(component, props, children) {
    const { document } = new JSDOM().window

    let styles = ''

    globalThis.h = hSSR
    globalThis.usestr = (strings, ...values) => {
        let out = ''
        for (let i in strings) {
            out += strings[i]
            if (values[i]) {
                out += values[i]
            }
        }
        return out
    }
    globalThis.use = (ptr, transform, ...rest) => {
        if (ptr instanceof Array) return usestr(ptr, transform, ...rest)
        return ptr
    }
    globalThis.css = (strings, ...values) => {
        let str = ''
        for (let f of strings) {
            str += f + (values.shift() || '')
        }
        const id = 'dl' + genuid()
        styles += `.${id}{
      ${str}
    }`

        return id
    }

    globalThis.useChange = () => {}
    globalThis.window = new JSDOM().window
    props['isRoot'] = true
    props['$ssr'] = (t) => {
        if (typeof t == 'function') return t()
        return t
    }

    let body = hSSR(component, props, children)

    const styleEl = document.createElement('style')
    styleEl.innerHTML = styles
    body.appendChild(styleEl)

    return body.outerHTML
}

export function hSSR(type, props, ...children) {
    const { document, HTMLElement } = new JSDOM().window

    if (typeof type == 'function') {
        let innerHTML = ''
        children.map((child) => {
            innerHTML += child.outerHTML ? child.outerHTML : ''
        })
        const newthis = {
            children: [children],
        }

        for (let key in props) {
            if (key.startsWith('bind:')) {
                const attr = key.slice(5)
                newthis[attr] = props[key]
                continue
            }

            newthis[key] = props[key]
        }

        let elm
        try {
            elm = type.apply(newthis)
            if (children != 0) {
                elm.innerHTML = innerHTML
            }
        } catch (error) {
            elm = document.createElement('div')
            elm.innerHTML = innerHTML
        }

        elm.setAttribute('data-component', type.name)
        if (props && props.isRoot) elm.setAttribute('id', 'ssr-root')
        elm.setAttribute('ssr-data-component', type.name)

        return elm
    }

    let el = document.createElement(type)

    for (let child of children) {
        if (typeof child == 'object' && child != null && 'remove' in child) {
            el.appendChild(child)
        } else {
            el.appendChild(document.createTextNode(child))
        }
    }

    for (let key in props) {
        let val = props[key]
        if (key == 'class') {
            if (!(val instanceof Array)) {
                el.className = val
                continue
            }
            el.className = ''
            val.map((cl) => (el.className += cl))
            continue
        }

        if (key == 'style' && typeof val == 'object') {
            for (let skey in val) {
                el.style[skey] = val[skey]
            }
            continue
        }

        if (key.startsWith('on:')) {
            continue
        }

        if (key.startsWith('bind:')) {
            let attr = key.slice(5)
            el.setAttribute(attr, val)
        }

        el.setAttribute(key, props[key])
    }

    return el
}
