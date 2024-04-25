import { assert } from './asserts'
import { h } from './core'
import { genuid } from './css'

export function html(strings, ...values) {
    // normalize the strings array, it would otherwise give us an object
    strings = [...strings]
    let flattened = ''
    let markers = {}
    for (let i = 0; i < strings.length; i++) {
        let string = strings[i]
        let value = values[i]

        // since self closing tags don't exist in regular html, look for the pattern <tag /> enclosing a function, and replace it with `<tag`
        let match =
            values[i] instanceof Function && /^ *\/\>/.exec(strings[i + 1])
        if (/\< *$/.test(string) && match) {
            strings[i + 1] = strings[i + 1].substr(
                match.index + match[0].length
            )
        }

        flattened += string
        if (i < values.length) {
            let dupe = Object.values(markers).findIndex((v) => v == value)
            let marker
            if (dupe !== -1) {
                marker = Object.keys(markers)[dupe]
            } else {
                marker = genuid()
                markers[marker] = value
            }

            flattened += marker

            // close the self closing tag
            if (match) {
                flattened += `></${marker}>`
            }
        }
    }
    let dom = new DOMParser().parseFromString(flattened, 'text/html')
    assert(
        dom.body.children.length == 1,
        'html builder needs exactly one child'
    )

    function wraph(elm) {
        let nodename = elm.nodeName.toLowerCase()
        if (nodename === '#text') return elm.textContent
        if (nodename in markers) nodename = markers[nodename]

        let children = [...elm.childNodes].map(wraph)
        for (let i = 0; i < children.length; i++) {
            let text = children[i]
            if (typeof text !== 'string') continue
            for (const [marker, value] of Object.entries(markers)) {
                if (!text) break
                if (!text.includes(marker)) continue
                let before
                ;[before, text] = text.split(marker)
                children = [
                    ...children.slice(0, i),
                    before,
                    value,
                    text,
                    ...children.slice(i + 1),
                ]
                i += 2
            }
        }

        let attributes = {}
        for (const attr of [...elm.attributes]) {
            let val = attr.nodeValue
            if (val in markers) val = markers[val]
            attributes[attr.name] = val
        }

        return h(nodename, attributes, children)
    }

    return wraph(dom.body.children[0])
}
