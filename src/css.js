Object.assign(window, { css, styled: { new: css, rule: css } })
const cssmap = {}

export function css(strings, ...values) {
    let str = ''
    for (let f of strings) {
        str += f + (values.shift() || '')
    }

    let cached = cssmap[str]
    if (cached) return cached

    const uid = `dl${Array(5)
        .fill(0)
        .map(() => {
            return Math.floor(Math.random() * 36).toString(36)
        })
        .join('')}`

    const styleElement = document.createElement('style')
    document.head.appendChild(styleElement)

    // kind of a hack. when css nesting stablizes this can be removed
    styleElement.textContent = str
    let newstr = ''
    let selfstr = ''
    while (!styleElement.sheet.cssRules.length) {
        let [first, ...rest] = str.split('\n')
        selfstr += first + '\n'
        str = rest.join('\n')
        styleElement.textContent = str
    }

    for (const rule of styleElement.sheet.cssRules) {
        rule.selectorText = `.${uid} ${rule.selectorText}`
        newstr += rule.cssText + '\n'
    }

    styleElement.textContent = `.${uid} {${selfstr}}` + '\n' + newstr
    console.log(styleElement.textContent)

    cssmap[str] = uid
    return uid
}
