import { createElement } from "react";
import { useChamp } from "@m4rw3r/react-pause-champ";

function Counter(): JSX.Element {
  const [counter, update] = useChamp("my-counter", 0);

  return (
    <div>
      <p>{counter}</p>
      <button onClick={() => update((i) => i + 1)}>Increment</button>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <div>
      <p>The test</p>
      <Counter />
    </div>
  );
}
