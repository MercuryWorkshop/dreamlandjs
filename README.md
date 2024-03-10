## What is Dreamland?
dreamland.js is a reactive JSX-inspired rendering library with **no virtual dom** and **no build step**

## Why Dreamland?
We've found frameworks such as React to be cumbersome, with more than just a few footguns. Dreamland can get you fast results with brutal simplicity. See the [Wiki](https://github.com/MercuryWorkshop/dreamlandjs/wiki) for more information.

## What does it look like?
Here's a simple counter app
```jsx
function App() {
  this.counter = 0;
  return (
    <div>
      <button on:click={() => this.counter++}>Click me!</button>
      <p>
       {use(this.counter)}
      </p>
    </div>
  );
}

window.addEventListener("load", () => {
  document.body.appendChild(<App/>);
});
```

Compare that to the equivalent code in react:
```jsx
import { React, useState } from 'react'
 
function App() {
  const [counter, setCounter] = useState(0);
 
  const increase = () => {
    setCounter(count => count + 1);
  };
 
  return (
    <div>
      <button onClick={increase}>Click me!</button>
      <p>
        Value: {counter}
      </p>
    </div>
  );
}

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);
```
The idea of dreamland is to get some of the convience of big framworks at a ridiculously tiny size (~3kb, smaller than preact) with less hurdles. 

# Getting Started
Dreamland can be integrated into plain-javascript applications gradually and seamlessly. See the [Wiki](https://github.com/MercuryWorkshop/dreamlandjs/wiki) for learning the concepts that dreamland uses.

## Plain JS
In your HTML file, add `<script src="https://unpkg.com/dreamland"></script>` somewhere. This unlocks the html builder allowing you to start writing dreamland code, such as the example shown below
```javascript
function App() {
  this.counter = 0;
  return html`
    <div>
      <button on:click=${() => this.counter++}>Click me!</button>
      <p>
        ${use(this.counter)}
      </p>
    </div>
  `;
}

window.addEventListener("load", () => {
  document.body.appendChild(h(App));
});
```
## Typescript + Bundler (vite, rollup, webpack, esbuild, etc)
First install dreamland (`npm install dreamland`), then add this to the compileroptions of your `tsconfig.json` to setup JSX.
```json
"jsx":"react",
"jsxFactory":"h",
"jsxFragmentFactory":"Fragment",
"types": ["dreamland"],
```
and run `npm install dreamland`.

In the entry point of the app, add the line `import "dreamland"` into at least one file to bundle dreamland with the rest of the code.

See the [Wiki](https://github.com/MercuryWorkshop/dreamlandjs/wiki) for more information.
