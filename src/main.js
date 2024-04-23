import { DLVERSION } from './consts'

export { DLVERSION }

export * from './core'
// $state was named differently in older versions
export { $state as stateful } from './core'

/* FEATURE.CSS.START */
export { css, scope } from './css'
/* FEATURE.CSS.END */

/* FEATURE.JSXLITERALS.START */
export { html } from './jsxLiterals'
/* FEATURE.JSXLITERALS.END */

/* FEATURE.STORES.START */
export { $store } from './stores'
/* FEATURE.STORES.END */

/* DEV.START */
import { log } from './asserts'

log('Version: ' + DLVERSION)
console.warn(
    'This is a DEVELOPER build of dreamland.js. It is not suitable for production use.'
)
console.info('Enabled features:', DLFEATURES.join(', '))
/* DEV.END */
