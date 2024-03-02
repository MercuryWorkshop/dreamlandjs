## What is Dreamland?
dreamland.js is a reactive JSX-based rendering library with **no virtual dom**

## Why do we need another javascript framework????
React is great, but the API is unnecesarily complex and bloated. Dreamland lets you write code where what you see is what you get, no trickery.

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

dreamland.js provides a simple and intuitive API at a low cost (~3kb, smaller than preact), while maintaining performance and ease of use

To get started with dreamland, add this to the compileroptions of your `tsconfig.json`
```json
"jsx":"react",
"jsxFactory":"h",
"jsxFragmentFactory":"Fragment",
"types": ["dreamland"],
```
and run `npm install dreamland`

If you prefer using modules and are using a bundler, simply `import "@mercuryworkshop/dreamlandjs";` into at least one file you're using.

If you don't like using modules, just add `<script src="://unpkg.com/dreamland"></script>` to your html, and you can use dreamland as normal.

dreamland can even be used without a build step, here's the counter example in plain JS
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


See the examples/ directory for more.
