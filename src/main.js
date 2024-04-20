import { VERSION } from './consts'
export { VERSION as DLVERSION }

export * from './core'
// $state was named differently in older versions
export { $state as stateful } from './core'

/* FEATURE.CSS.START */
export * from './css'
/* FEATURE.CSS.END */

/* FEATURE.JSXLITERALS.START */
export * from './jsxLiterals'
/* FEATURE.JSXLITERALS.END */

/* FEATURE.STORES.START */
export * from './stores'
/* FEATURE.STORES.END */

/* DEV.START */
import { log } from './asserts'

log('Version: ' + VERSION)
console.warn(
    'This is a DEVELOPER build of dreamland.js. It is not suitable for production use.'
)
console.info('Enabled features:', DLFEATURES.join(', '))
/* DEV.END */
