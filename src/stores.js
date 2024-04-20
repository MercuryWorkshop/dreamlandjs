import { assert } from './asserts'
import { isDLPtr, isStateful, $state } from './core'

import {
    LISTENERS,
    STATEHOOK,
    USE_MAPFN,
    TARGET,
    PROXY,
    STEPS,
    IF,
} from './consts'

const delegates = []

export function $store(target, { ident, backing, autosave }) {
    let read, write
    if (typeof backing === 'string') {
        switch (backing) {
            case 'localstorage':
                read = () => localStorage.getItem(ident)
                write = (ident, data) => {
                    localStorage.setItem(ident, data)
                }
                break
            default:
                assert('Unknown store type: ' + backing)
        }
    } else {
        ;({ read, write } = backing)
    }

    let save = () => {
        console.info('[dreamland.js]: saving ' + ident)

        // stack gets filled with "pointers" representing unique objects
        // this is to avoid circular references

        let serstack = {}
        let vpointercount = 0

        let ser = (tgt) => {
            let obj = {
                stateful: isStateful(tgt),
                values: {},
            }
            let i = vpointercount++
            serstack[i] = obj

            for (let key in tgt) {
                let value = tgt[key]

                if (isDLPtr(value)) continue // i don"t think we should be serializing pointers?
                switch (typeof value) {
                    case 'string':
                    case 'number':
                    case 'boolean':
                    case 'undefined':
                        obj.values[key] = JSON.stringify(value)
                        break

                    case 'object':
                        if (value instanceof Array) {
                            obj.values[key] = value.map((v) => {
                                if (typeof v === 'object') {
                                    return ser(v)
                                } else {
                                    return JSON.stringify(v)
                                }
                            })
                            break
                        } else {
                            assert(
                                value.__proto__ === Object.prototype,
                                'Only plain objects are supported'
                            )
                            obj.values[key] = ser(value)
                        }
                        break

                    case 'symbol':
                    case 'function':
                    case 'bigint':
                        assert('Unsupported type: ' + typeof value)
                        break
                }
            }

            return i
        }
        ser(target)

        let string = JSON.stringify(serstack)
        write(ident, string)
    }

    let autohook = (target, prop, value) => {
        if (isStateful(value)) value[TARGET][STATEHOOK] = autohook
        save()
    }

    let destack = JSON.parse(read(ident))
    if (destack) {
        let objcache = {}

        let de = (i) => {
            if (objcache[i]) return objcache[i]
            let obj = destack[i]
            let tgt = {}
            for (let key in obj.values) {
                let value = obj.values[key]
                if (typeof value === 'string') {
                    tgt[key] = JSON.parse(value)
                } else {
                    if (value instanceof Array) {
                        tgt[key] = value.map((v) => {
                            if (typeof v === 'string') {
                                return JSON.parse(v)
                            } else {
                                return de(v)
                            }
                        })
                    } else {
                        tgt[key] = de(value)
                    }
                }
            }
            if (obj.stateful && autosave == 'auto') tgt[STATEHOOK] = autohook
            let newobj = obj.stateful ? $state(tgt) : tgt
            objcache[i] = newobj
            return newobj
        }

        target = de(0)
    }

    delegates.push(save)
    switch (autosave) {
        case 'beforeunload':
            addEventListener('beforeunload', save)
            break
        case 'manual':
            break
        case 'auto':
            target[STATEHOOK] = autohook
            break
        default:
            assert('Unknown autosave type: ' + autosave)
    }

    return $state(target)
}

export function saveAllStores() {
    delegates.forEach((cb) => cb())
}
