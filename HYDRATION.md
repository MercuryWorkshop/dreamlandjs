# DreamlandJS Hydration

This document explains how to use the `hydrate` function in DreamlandJS for server-side rendering (SSR) and static site generation (SSG) scenarios.

## Overview

The `hydrate` function allows you to take an existing DOM tree (e.g., from server-side rendering or static HTML) and attach DreamlandJS component functionality to it without recreating the DOM from scratch. This enables:

- Server-side rendering with client-side interactivity
- Progressive enhancement of static HTML
- Faster initial page loads by avoiding DOM reconstruction

## API Reference

```typescript
function hydrate<T extends Component<any, any, any>>(
  rootElement: HTMLElement,
  component: T,
  props?: Record<string, any>,
  children?: ComponentChild[]
): ComponentInstance<T>
```

### Parameters

- `rootElement`: The existing DOM element to hydrate
- `component`: The DreamlandJS component function to hydrate with
- `props`: Props to pass to the component (optional, default: {})
- `children`: Children to pass to the component (optional, default: [])

### Returns

The hydrated element with DreamlandJS functionality attached, including the component context (`$` property).

## Basic Usage

```javascript
import { hydrate, jsx } from 'dreamland/core';

// Define a component
function MyComponent() {
  this.count = 0;
  
  this.css = `
    button { padding: 10px; margin: 5px; }
    .count { font-weight: bold; color: blue; }
  `;
  
  return jsx("div", {}, [
    jsx("div", { class: "count" }, `Count: ${this.count}`),
    jsx("button", { 
      "on:click": () => this.count++ 
    }, "Increment")
  ]);
}

// Hydrate existing HTML
const existingElement = document.getElementById('my-app');
const hydratedComponent = hydrate(existingElement, MyComponent);

// The component is now interactive
console.log(hydratedComponent.$); // Component context
```

## Server-Side Rendering Example

### 1. Server-side (Node.js)

```javascript
// server.js
import { renderToString } from 'dreamland/ssr'; // hypothetical SSR module

function CounterApp() {
  this.count = 0;
  return jsx("div", { id: "app" }, [
    jsx("h1", {}, "Counter App"),
    jsx("div", {}, `Count: ${this.count}`),
    jsx("button", {}, "Increment")
  ]);
}

const html = `
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  ${renderToString(CounterApp)}
  <script type="module">
    import { hydrate, jsx } from '/static/dreamland.js';
    
    function CounterApp() {
      this.count = 0;
      return jsx("div", { id: "app" }, [
        jsx("h1", {}, "Counter App"),
        jsx("div", {}, use(this.count)),
        jsx("button", { 
          "on:click": () => this.count++ 
        }, "Increment")
      ]);
    }
    
    hydrate(document.getElementById('app'), CounterApp);
  </script>
</body>
</html>
`;
```

### 2. Client-side Hydration

The client-side code hydrates the server-rendered HTML, making it interactive without a full re-render.

## Progressive Enhancement Example

```html
<!-- Static HTML (works without JavaScript) -->
<div id="enhanced-form">
  <h2>Contact Form</h2>
  <form action="/submit" method="POST">
    <input type="text" name="name" placeholder="Name" />
    <input type="email" name="email" placeholder="Email" />
    <button type="submit">Submit</button>
  </form>
  <div id="status"></div>
</div>

<script type="module">
import { hydrate, jsx, createState } from 'dreamland/core';

function EnhancedForm() {
  this.status = '';
  this.loading = false;
  
  // Enhanced form with client-side validation and AJAX
  return jsx("div", {}, [
    jsx("h2", {}, "Contact Form"),
    jsx("form", { 
      "on:submit": async (e) => {
        e.preventDefault();
        this.loading = true;
        this.status = 'Submitting...';
        
        // AJAX submission
        try {
          const response = await fetch('/submit', {
            method: 'POST',
            body: new FormData(e.target)
          });
          this.status = response.ok ? 'Success!' : 'Error occurred';
        } catch (err) {
          this.status = 'Network error';
        }
        this.loading = false;
      }
    }, [
      jsx("input", { type: "text", name: "name", placeholder: "Name", required: true }),
      jsx("input", { type: "email", name: "email", placeholder: "Email", required: true }),
      jsx("button", { 
        type: "submit", 
        disabled: use(this.loading) 
      }, use(this.loading) ? "Submitting..." : "Submit")
    ]),
    jsx("div", { id: "status" }, use(this.status))
  ]);
}

// Hydrate existing form with enhanced functionality
hydrate(document.getElementById('enhanced-form'), EnhancedForm);
</script>
```

## Caveats and Limitations

### 1. DOM Structure Matching

The existing DOM structure should reasonably match what the component would create:

```javascript
// ✅ Good - structures match
// Existing HTML: <div><h1>Title</h1><p>Content</p></div>
function MyComponent() {
  return jsx("div", {}, [
    jsx("h1", {}, "Title"),
    jsx("p", {}, "Content")
  ]);
}

// ❌ Problematic - structures don't match
// Existing HTML: <section><span>Title</span></section>
// Component creates: <div><h1>Title</h1><p>Content</p></div>
```

### 2. Reactive Content

Text content containing reactive values may be overwritten during hydration:

```javascript
// Existing HTML: <div>Count: 5</div>
// Component: jsx("div", {}, `Count: ${use(this.count)}`)
// Result: Text will be replaced with current component state
```

### 3. Event Listeners

Event listeners from the original HTML are not preserved. Only component-defined event listeners will be active after hydration.

### 4. CSS Scoping

DreamlandJS CSS classes will be added to hydrated elements, which may affect styling:

```javascript
function StyledComponent() {
  this.css = `
    div { background: blue; }
  `;
  return jsx("div", {}, "Content");
}

// After hydration, the div will have scoped CSS classes added
// and the blue background will apply
```

## Best Practices

### 1. Design for Hydration

When building components that will be hydrated, consider the server-rendered state:

```javascript
function UserProfile({ userId }) {
  // Initialize with server data if available
  this.user = window.__INITIAL_DATA__?.user || { name: 'Loading...' };
  this.loading = !window.__INITIAL_DATA__?.user;
  
  // Load data if not already available
  if (this.loading) {
    loadUser(userId).then(user => {
      this.user = user;
      this.loading = false;
    });
  }
  
  return jsx("div", {}, [
    jsx("h1", {}, use(this.user.name)),
    jsx("div", { 
      "class:loading": use(this.loading) 
    }, "Profile content...")
  ]);
}
```

### 2. Graceful Degradation

Ensure your HTML works without JavaScript:

```html
<!-- Works without JavaScript -->
<form action="/search" method="GET">
  <input type="text" name="q" placeholder="Search..." />
  <button type="submit">Search</button>
</form>

<script type="module">
// Enhanced with JavaScript
hydrate(document.querySelector('form'), SearchForm);
</script>
```

### 3. Handle Hydration Mismatches

```javascript
function RobustComponent() {
  this.mounted = false;
  
  this.mount = () => {
    this.mounted = true;
    // Perform any post-hydration setup
    console.log('Component hydrated successfully');
  };
  
  return jsx("div", {}, [
    jsx("p", {}, "This component handles hydration gracefully"),
    jsx("div", { 
      style: use(this.mounted) ? "" : "opacity: 0.5" 
    }, "Interactive content")
  ]);
}
```

## Integration with Build Tools

The hydrate function works well with modern build tools and can be used with:

- **Vite**: For development and production builds
- **Webpack**: With appropriate loaders for JSX
- **Rollup**: For library builds
- **esbuild**: For fast builds

Example with Vite:

```javascript
// vite.config.js
export default {
  esbuild: {
    jsxFactory: 'jsx',
    jsxImportSource: 'dreamland/core'
  }
};
```

## Conclusion

The `hydrate` function enables DreamlandJS to work seamlessly with server-side rendering and static site generation, providing a path for progressive enhancement and improved performance. By following the best practices and understanding the limitations, you can build applications that work well both with and without JavaScript.