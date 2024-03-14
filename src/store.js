Object.assign(window, { $store })
function $store(target, ident, type) {
    let stored = localStorage.getItem(ident)
    target = JSON.parse(stored) ?? target

    addEventListener('beforeunload', () => {
        console.info('[dreamland.js]: saving ' + ident)
        localStorage.setItem(ident, JSON.stringify(target))
    })

    return stateful(target)
}
