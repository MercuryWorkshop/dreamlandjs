import { cssBoundary } from "./consts"

const cssmap = {}



/* POLYFILL.SCOPE.START */
let scopeSupported;

window.addEventListener('load', () => {
    const style = document.createElement('style');
    style.textContent = '@scope (.test) { :scope { color: red } }';
    document.head.appendChild(style);

    const testElement = document.createElement('div');
    testElement.className = 'test';
    document.body.appendChild(testElement);

    const computedColor = getComputedStyle(testElement).color;
    document.head.removeChild(style);
    document.body.removeChild(testElement);

    scopeSupported = computedColor == 'rgb(255, 0, 0)'
});

const depth = 50;
// polyfills @scope for firefox and older browsers, using a :not selector recursively increasing in depth
// depth 50 means that after 50 layers of nesting, switching between an unrelated component and the target component, it will eventually stop applying styles (or let them leak into children)
// this is slow. please ask mozilla to implement @scope
function polyfill_scope(target) {
    let boundary = `:not(${target}).${cssBoundary}`
    let g = (str, i) => `${str} *${i > depth ? "" : `:not(${g(str + " " + ((i % 2 == 0) ? target : boundary), i + 1)})`}`
    return `:not(${g(boundary, 0)})`
}
/* POLYFILL.SCOPE.END */


export function genuid() {
    return `dl${Array(5)
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

        return genCss(str, scoped)
    }

export const css = csstag(false)
export const scope = csstag(true)


function parseCombinedCss(str) {
    let newstr = ''
    let selfstr = ''

    // compat layer for older browsers. when css nesting stablizes this can be removed
    str += '\n'
    for (; ;) {
        let [first, ...rest] = str.split('\n')
        if (first.trim().endsWith('{')) break

        selfstr += first + '\n'
        str = rest.join('\n')
        if (!str) break
    }

    return [newstr, selfstr, str]
}

function genCss(str, scoped) {
    let cached = cssmap[str]
    if (cached) return cached

    const uid = genuid();
    cssmap[str] = uid


    const styleElement = document.createElement('style')
    document.head.appendChild(styleElement)

    if (scoped) {
        /* POLYFILL.SCOPE.START */
        if (!scopeSupported) {
            [newstr, selfstr, str] = parseCombinedCss(str)

            styleElement.textContent = str

            let scoped = polyfill_scope(`.${uid}`, 50);
            for (const rule of styleElement.sheet.cssRules) {
                rule.selectorText = `.${uid} ${rule.selectorText}${scoped}`
                newstr += rule.cssText + '\n'
            }

            styleElement.textContent = `.${uid} {${selfstr}}` + '\n' + newstr
            return uid
        }
        /* POLYFILL.SCOPE.END */

        styleElement.textContent = `@scope (.${uid}) to (:not(.${uid}).dl-boundary *) { :scope { ${str} } }`
    } else {
        [newstr, selfstr, str] = parseCombinedCss(str)

        styleElement.textContent = str

        for (const rule of styleElement.sheet.cssRules) {
            rule.selectorText = `.${uid} ${rule.selectorText}`
            newstr += rule.cssText + '\n'
        }

        styleElement.textContent = `.${uid} {${selfstr}}` + '\n' + newstr
    }

    return uid
}
