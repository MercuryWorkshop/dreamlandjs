function Index() {
  let css = styled.new`
    self {
      background-color: #1f1d2e;
      border-radius: 25px;
      padding:2em;
    }

    button {
      border-radius: 25px;
    }

    p,h1 {
      font-family: "serif";
      color: #e0def4;
    }

    p {
      font-size:15px;
    }
`;

  this.counter = 0;

  return (
    <div css={css}>
      <h1>AliceJS Examples</h1>
      <button #click={() => this.counter++} >Click me!</button>
      <p>
        Value: {use(this.counter)}
      </p>
      <p>
        is {use(this.counter)} odd? {use(this.counter, p => p % 2 == 1)}
      </p>
    </div>
  );
}

window.addEventListener("load", () => {
  document.body.appendChild(<Index />);
});
