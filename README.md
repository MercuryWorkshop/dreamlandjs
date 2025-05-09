<h1 align="center">dreamland.js</h1>
<p align="center"><img src="./static/logo.png" alt="logo" height="100"></p>

dreamland is a reactive JSX-inspired UI library with **no virtual dom** and **no build step**. It is less than 3kb minified (smaller than preact), gradually integrates with existing plain JS projects, and is reasonably easy to learn.

<div align="center">
 <a href="https://dreamland.js.org/getting-started">Get Started</a> | <a href="https://dreamland.js.org">Documentation</a> | <a href="https://dreamland.js.org/examples">Examples</a> | <a href="https://discord.gg/GKKF3CmHPA">Discord</a>
</div>
<br/>

<div align="center">
  <img src="https://img.shields.io/github/issues/MercuryWorkshop/dreamlandjs?style=for-the-badge&color=purple" height="25"/>
  <img src="https://img.shields.io/github/stars/MercuryWorkshop/dreamlandjs?style=for-the-badge&color=purple" height="25"/>
</div>

---

# Getting Started

## Plain JS

dreamland can be integrated into plain javascript applications gradually and seamlessly. See the [website](https://dreamland.js.org) to learn the concepts that dreamland uses.

To get started, in your HTML file, add `<script src="https://unpkg.com/dreamland"></script>` somewhere. This contains the html builder allowing you to start writing dreamland code in plain JS, such as the example shown below

```javascript
function App() {
    this.counter = 0
    return html`
        <div>
            <button on:click=${() => this.counter++}>Click me!</button>
            <p>${use(this.counter)}</p>
        </div>
    `
}

window.addEventListener('load', () => {
    document.body.appendChild(h(App))
})
```

Note that this is a development build. For production, you should pin the version and use either the "all" or "minimal" bundle depending on the features you want (ex. https://unpkg.com/dreamland@1.0.0/dist/all.js)

## Typescript + Bundler (vite, rollup, webpack, esbuild, etc)

First install dreamland (`npm install dreamland`), then add this to the compileroptions of your `tsconfig.json` to setup JSX.

```json
jsx: "react-jsx",
jsxImportSource: "dreamland"
```

Now you can import anything needed from `dreamland/core`.

```tsx
import { Component, render } from "dreamland/core";

// typescript syntax for defining components
const App: Component<
    {
        // component properties. if you had a component that took a property like `<Button text="..." /> you would use a type like the one in the following line
        // text: string
    },
    {
        // types for internal state
        counter: number
    }
> = function () {
    this.counter = 0
    return (
        <div>
            <button on:click={() => this.counter++}>Click me!</button>
            <p>{use(this.counter)}</p>
        </div>
    )
}

window.addEventListener('load', () => {
    document.body.appendChild(render(<App />))
})
```
