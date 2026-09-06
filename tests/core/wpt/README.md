# WPT selector corpus

Vendored from [web-platform-tests](https://github.com/web-platform-tests/wpt),
licensed under the 3-clause BSD license (see `LICENSE.md`).

| file             | upstream path                                    |
| ---------------- | ------------------------------------------------ |
| `selectors.json` | `dom/nodes/selectors.js`                         |
| `content.html`   | `dom/nodes/ParentNode-querySelector-All-content.html` |

`selectors.json` is the upstream `validSelectors` array reduced to the 198
entries that are `TEST_QSA`-testable against an HTML document, keeping only the
`name`, `selector` and `expect` fields. The upstream `invalidSelectors` array is
not vendored: selectors reach the scoper as `CSSRule.selectorText`, so they have
already been through a css parser and are valid by construction.

`content.html` is byte-for-byte upstream and must stay that way -- `:empty`,
`:first-child` and the sibling combinators all depend on its exact whitespace.
It is listed in `.prettierignore` for that reason.
