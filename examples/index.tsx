function Counter() {
    this.css = css`
        self {
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
        }

        button {
            border-radius: 5px;
            border: none;
            outline: none;
            width: 10em;
            height: 5em;
            background-color: #f6c177;
        }

        p {
            font-size: 20px;
        }
    `

    this.counter ??= 0

    return (
        <div class="box">
            <h1>Counter</h1>
            <p>Value: {use(this.counter)}</p>
            <button on:click={() => this.counter++}>Click me!</button>
            <p>
                is {use(this.counter)} odd?{' '}
                {use(this.counter, (p) => p % 2 == 1)}
            </p>
        </div>
    )
}
//
// function ToDoList() {
//   let css = styled.new`
//     self {
//       color: #e0def4;
//       display:flex;
//       flex-direction:column;
//     }
//
//     .todoitem {
//       display:flex;
//     }
// `
//
//   this.tasks = [];
//   this.text = "Enter a task here...";
//
//   let addTask = () => {
//     if (!this.text) return;
//     this.tasks = [...this.tasks, this.text];
//     this.text = "";
//   };
//
//   return (
//     <div class="box" css={css}>
//       <div>
//         <input bind:value={use(this.text)} on:change={() => addTask()} />
//         <button on:click={() => addTask()}>Add Task</button>
//       </div>
//       <div for={use(this.tasks)} do={(task, i) =>
//         <div class="todoitem">
//           {task}
//           <button on:click={() => {
//             this.tasks.splice(i, 1)
//             this.tasks = this.tasks
//           }}>Delete</button>
//         </div>
//       } />
//     </div>
//   )
// }
//
//
// function Index() {
//   let css = styled.new`
//     h1 {
//       font-size: 40px;
//       text-align:center;
//     }
//     p {
//       text-align:center;
//       font-size:15px;
//     }
//     div {
//       /* margin-bottom:3em; */
//     }
//     examples {
//       display: flex;
//       justify-content: center;
//       flex-direction: column;
//     }
// `;
//
//   this.c = 5;
//
//   this.counterobj;
//
//   return (
//     <div className={"as"}>
//       <Counter />
//       {/* <div> */}
//       {/*   <h1>Dreamland Examples</h1> */}
//       {/*   <p>Some examples of dreamland.js components. Code is in examples/</p> */}
//       {/* </div> */}
//       {/* <examples> */}
//       {/*   <Counter a="b" bind:this={use(this.counterobj)} bind:counter={use(this.c)} /> */}
//       {/*   <ToDoList /> */}
//       {/* </examples> */}
//       {/* stuff: {use(this.counterobj.counter)} */}
//       {/* <button on:click={() => this.counterobj.counter++}>as</button> */}
//     </div>
//   );
// }

window.addEventListener('load', () => {
    document.body.appendChild(<Counter />)
})

let a = stateful({
    b: stateful({ c: stateful({ d: 0 }) }),
    array: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
    ],
}) as any
let r = use(a.array[a.b.c.d][a.b.c.d])

handle(r, (v) => {
    console.log(v)
})
