export { Fragment, $state, isStateful, isDLPtr, $if, handle, h } from './core'

// $state was named differently in older versions
export { $state as stateful } from './core';

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

// expose internal mechanics
import * as CONSTS from './consts'
import { isDLPtrInternal } from './core'
window.DREAMLAND_SECRET_DEV_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
    ...CONSTS,
    isDLPtrInternal
}

log('Version: ' + DLVERSION)
console.warn(
    'This is a DEVELOPER build of dreamland.js. It is not suitable for production use.'
)
console.info('Enabled features:', DLFEATURES.join(', '))
/* DEV.END */
