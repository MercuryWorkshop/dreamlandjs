Object.assign(window, { css, rule: css, styled: { new: css, rule: css } })
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

    styleElement.textContent = `.${uid} { ${str}; }`
    cssmap[str] = uid

    return uid
}
