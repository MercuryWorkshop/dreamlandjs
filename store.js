Object.assign(window, { $store });
export function $store(target, ident, type) {
  let stored = localStorage.getItem(ident);
  target = JSON.parse(stored) ?? target;

  addEventListener("beforeunload", () => {
    localStorage.setItem(JSON.stringify(target));
    console.info("[dreamland.js]: saving " + ident);
  });

  return stateful(target);
}
