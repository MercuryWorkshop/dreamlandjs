<h1 align="center">dreamland.js</h1>
<p align="center"><img src="./static/logo.png" alt="logo" height="100"></p>
<p align="center">A utilitarian JSX framework for plain javascript</p>

<div align="center">
  <img src="https://img.shields.io/github/issues/MercuryWorkshop/dreamlandjs?style=for-the-badge&color=purple" height="25"/>
  <img src="https://img.shields.io/github/stars/MercuryWorkshop/dreamlandjs?style=for-the-badge" height="25"/>
</div>

## What is Dreamland?

dreamland.js is a reactive JSX-inspired rendering library with **no virtual dom** and **no build step**

## Why Dreamland?

For a lot of projects, bulky frameworks like react don't make sense, but it would be too cumbersome to write everything in plain javascript. dreamland can integrate directly into plain js projects, and give you back some of the convience of big frameworks with a tiny bundle size, no build step, and compatibility with plain DOM operations.

## What does it look like?

Here's a simple counter app

```jsx
function App() {
    this.counter = 0
    return (
        <div>
            <button on:click={() => this.counter++}>Click me!</button>
            <p>{use(this.counter)}</p>
        </div>
    )
}

window.addEventListener('load', () => {
    document.body.appendChild(<App />)
})
```

Compare that to the equivalent code in react:

```jsx
import { React, useState } from 'react'

function App() {
    const [counter, setCounter] = useState(0)

    const increase = () => {
        setCounter((count) => count + 1)
    }

    return (
        <div>
            <button onClick={increase}>Click me!</button>
            <p>Value: {counter}</p>
        </div>
    )
}

ReactDOM.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
    document.getElementById('root')
)
```

The idea of dreamland is to get some of the convience of big framworks at a ridiculously tiny size (~3kb, smaller than preact) with less hurdles.

# Getting Started

dreamland can be integrated into plain-javascript applications gradually and seamlessly. See the [website](https://dreamland.js.org) to learn the concepts that dreamland uses.

## Plain JS

In your HTML file, add `<script src="https://unpkg.com/dreamland"></script>` somewhere. This contains the html builder allowing you to start writing dreamland code in plain JS, such as the example shown below

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

Note that this is a development build. For production, you should pin the version and use either the "all" or "minimal" bundle depending on the features you want (ex. https://unpkg.com/dreamland@0.0.8/dist/all.js)

## Building a custom bundle

If you care about the bundle size, it is reccommended to serve a custom bundle with only the features you need.

```bash
git clone https://MercuryWorkshop/dreamland
cd dreamland
npm install
npm rollup -c --file path/to/output.js --enable-jsxLiterals --disable-css
# see https://dreamland.js.org/docs/building for more options
```

## Typescript + Bundler (vite, rollup, webpack, esbuild, etc)

First install dreamland (`npm install dreamland`), then add this to the compileroptions of your `tsconfig.json` to setup JSX.

```json
"jsx":"react",
"jsxFactory":"h",
"jsxFragmentFactory":"Fragment",
"types": ["dreamland"],
```

In the entry point of the app, add the line `import "dreamland/dev"` into at least one file to bundle dreamland with the rest of the code. Now you can use dreamland with tsx syntax.

In production, you can use `import "dreamland"` instead of `import "dreamland/dev"` to use the production build, or (reccommended) vendor in a custom build.

```tsx
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
    document.body.appendChild(<App />)
})
```

See the [documentation](https://dreamland.js.org) for more information.
