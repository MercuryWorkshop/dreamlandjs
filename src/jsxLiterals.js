export function html(strings, ...values) {
    let flattened = ''
    let markers = {}
    for (const i in strings) {
        let string = strings[i]
        let value = values[i]

        flattened += string
        if (i < values.length) {
            let dupe = Object.values(markers).findIndex((v) => v == value)
            if (dupe !== -1) {
                flattened += Object.keys(markers)[dupe]
            } else {
                let marker =
                    'm' +
                    Array(16)
                        .fill(0)
                        .map(() => Math.floor(Math.random() * 16).toString(16))
                        .join('')
                markers[marker] = value
                flattened += marker
            }
        }
    }
    let dom = new DOMParser().parseFromString(flattened, 'text/html')
    if (dom.body.children.length !== 1)
        throw 'html builder needs exactly one child'

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
