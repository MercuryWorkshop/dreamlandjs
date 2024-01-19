## What is AliceJS?
AliceJS is a reactive JSX-based rendering library with **no virtual dom**

## Why do we need another javascript framework????
React is great, but the API is unnecesarily complex and bloated. AliceJS lets you write code where what you see is what you get, no trickery.

## What does it look like?
Here's a simple counter app
```jsx
function App() {
  this.counter = 0;
  return (
    <div>
      <button on:click={() => this.counter++} >Click me!</button>
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

AliceJS provides a simple and intuitive API at a low cost (~8kb, smaller than preact)

To get started with AliceJS, add this to the compileroptions of your `tsconfig.json`
```json
"jsx":"react",
"jsxFactory":"h",
"jsxFragmentFactory":"YOU_CANT_USE_FRAGMENTS",
"types": ["@mercuryworkshop/alicejs"],
```
and run `npm install @mercuryworkshop/alicejs`

If you prefer using modules and are using a bundler, simply `import "@mercuryworkshop/alicejs";` into at least one file you're using.

If you don't like using modules, just add `<script src="://unpkg.com/@mercuryworkshop/alicejs"></script>` to your html, and you can use AliceJS as normal.

AliceJS can even be used without a build step, here's the counter example in plain JS
```javascript
function Index() {
    this.counter = 0;
    return (h("div",{},
        h("button", { "on:click": () => this.counter++ }, "Click me!"),
        h("p",{}, "Value: ", use(this.counter))));
}
window.addEventListener("load", () => {
    document.body.appendChild(h(Index));
});
```


See the examples/ directory for more.
