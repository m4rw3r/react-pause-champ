import { Suspense, createElement, useTransition, useState } from "react";
import { useChamp } from "@m4rw3r/react-pause-champ";

/*
function fakeChamp(id, initial) {
  const [data, setData] = useState(["value", initial]);

  console.log(data);

  if (data[0] !== "value") {
    console.log("suspending");
    throw data[1];
  }

  function update(value) {
    if (value && typeof value?.then === "function") {
      setData([
        "pending",
        value.then(
          (value) => {
            console.log("Setting resolved value", value);

            setData(["value", value]);
          },
          (error) => {
            console.log("Setting rejected value", error);

            setData(["error", error]);
          },
        ),
      ]);
    } else {
      setData(["value", value]);
    }
  }

  return [data[1], update];
}
*/

function Counter({
  id,
  startTransition,
}: {
  id: string;
  startTransition: (block: () => void) => void;
}): JSX.Element {
  // const [counter, update] = useChamp(id, id === "counter0" ? 0 : () => new Promise((resolve) => setTimeout(() => resolve(0), 1000)));
  const [counter, update] = useChamp<number>(
    id,
    () => new Promise((resolve) => setTimeout(() => resolve(0), 1000)),
  );
  // const [counter, update] = useChamp(id, 0);
  //  const [counter, update] = fakeChamp("my-counter", 0);

  return (
    <div>
      <p>{counter}</p>
      <button
        onClick={() =>
          update(
            new Promise((resolve) =>
              setTimeout(() => resolve(counter + 1), 500),
            ),
          )
        }
      >
        Increment
      </button>
      <button
        onClick={() => {
          startTransition(() => {
            update(
              new Promise((resolve) =>
                setTimeout(() => resolve(counter + 1), 500),
              ),
            );
          });
        }}
      >
        Increment Transition
      </button>
    </div>
  );
}

function Loader(): JSX.Element {
  return <p>Loading...</p>;
}

export function App(): JSX.Element {
  const [isTransition, startTransition] = useTransition();
  const [n, setN] = useState(0);

  console.log("isTransition:", isTransition);

  return (
    <div style={isTransition ? { opacity: 0.5 } : {}}>
      <button onClick={() => setN(n + 2)}>+1</button>
      <button onClick={() => startTransition(() => setN(n + 1))}>
        +1 useTransition
      </button>
      <Suspense fallback={<Loader />}>
        <p>The test</p>
        <Counter id={`counter-{n}`} startTransition={startTransition} />
      </Suspense>
    </div>
  );
}
