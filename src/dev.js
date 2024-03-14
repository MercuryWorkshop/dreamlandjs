import { log } from './asserts'
import { VERSION } from './consts'

import './js'
import './css'
import './html'
import './store'

log('Version: ' + VERSION)
console.warn(
    'This is a DEVELOPER build of dreamland.js. It is not suitable for production use.'
)
