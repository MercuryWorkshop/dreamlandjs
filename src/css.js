import { cssBoundary } from './consts'

export const cssmap = {}

/* POLYFILL.SCOPE.START */
const depth = 50
// polyfills @scope for firefox and older browsers, using a :not selector recursively increasing in depth
// depth 50 means that after 50 layers of nesting, switching between an unrelated component and the target component, it will eventually stop applying styles (or let them leak into children)
// this is slow. please ask mozilla to implement @scope
function polyfill_scope(target) {
    let boundary = `:not(${target}).${cssBoundary}`
    let g = (str, i) =>
        `${str} *${i > depth ? '' : `:not(${g(str + ' ' + (i % 2 == 0 ? target : boundary), i + 1)})`}`
    return `:not(${g(boundary, 0)})`
}
/* POLYFILL.SCOPE.END */

export function genuid() {
    return `${Array(4)
        .fill(0)
        .map(() => {
            return Math.floor(Math.random() * 36).toString(36)
        })
        .join('')}`
}

const csstag = (scoped) =>
    function css(strings, ...values) {
        let str = ''
        for (let f of strings) {
            str += f + (values.shift() || '')
        }

        return genCss('dl' + genuid(), str, scoped)
    }

export const css = csstag(false)
export const scope = csstag(true)

export function genCss(uid, str, scoped) {
    let cached = cssmap[str]
    if (cached) return cached

    cssmap[str] = uid

    const styleElement = document.createElement('style')
    document.head.appendChild(styleElement)

    let newstr = ''
    let selfstr = ''

    str += '\n'
    for (;;) {
        let [first, ...rest] = str.split('\n')
        if (first.trim().endsWith('{')) break

        selfstr += first + '\n'
        str = rest.join('\n')
        if (!str) break
    }

    styleElement.textContent = str
    let scopeSupported = true
    /* POLYFILL.SCOPE.START */
    scopeSupported = !!window.CSSScopeRule
    /* POLYFILL.SCOPE.END */
    if (scoped && scopeSupported) {
        let extstr = ''
        for (const rule of styleElement.sheet.cssRules) {
            if (!rule.selectorText && !rule.media) {
                extstr += rule.cssText
            } else if (rule.selectorText?.startsWith(':')) {
                rule.selectorText = `.${uid}${rule.selectorText}`
                extstr += rule.cssText
            } else {
                newstr += rule.cssText
            }
        }

        styleElement.textContent = `.${uid} {${selfstr}} @scope (.${uid}) to (:not(.${uid}).${cssBoundary} *) { ${newstr} } ${extstr}`
    } else {
        let scopedSelector = ''
        /* POLYFILL.SCOPE.START */
        if (scoped && !scopeSupported)
            scopedSelector = polyfill_scope(`.${uid}`, 50)
        /* POLYFILL.SCOPE.END */
        const processRule = (rule) => {
            if (rule.selectorText)
                rule.selectorText = rule.selectorText
                    .split(',')
                    .map((x) => {
                        x = x.trim()
                        if (x[0] === '&') {
                            return `.${uid}${x.slice(1)}${scopedSelector}`
                        } else if (x[0] === ':') {
                            return `.${uid}${x}${scopedSelector}`
                        } else {
                            return `.${uid} ${x}${scopedSelector}`
                        }
                    })
                    .join(', ')
            newstr += rule.cssText
        }
        for (const rule of styleElement.sheet.cssRules) {
            if (rule.media && rule.media.mediaText) {
                newstr += `@media(${rule.media.mediaText}){`
                Array.from(rule.cssRules).map(processRule)
                newstr += '}'
            } else {
                processRule(rule)
            }
        }

        styleElement.textContent = `.${uid} {${selfstr}}${newstr}`
    }

    return uid
}
