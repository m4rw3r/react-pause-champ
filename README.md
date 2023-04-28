# React Pause Champ

Isomorphic React hook providing async-aware stateful variables to components,
with Suspense and Server-Side-Rendering support.

## Features

- [React `useState`](https://react.dev/reference/react/useState)-like API

  Pass an identifier and an initial value to the `useChamp` hook and you get
  the current value and a setter, almost exactly like React's `useState`!

- Asynchronous initializers and updates

  Any function passed as either the initial value or an update of a stateful
  variable can be asynchronous, either through using the `async`-keyword or
  by returning a `Promise`.

- [Suspense](https://react.dev/reference/react/Suspense)

  Asynchronous state initializers and updates will trigger fallback components
  if wrapped in `<Suspense/>`-boundaries. For updates this can be managed using
  React's [`startTransition`](https://react.dev/reference/react/startTransition).

- [Server-Side-Rendering](https://react.dev/reference/react-dom/server)

  The whole application can render on the server, await asynchronous data, and
  then hydrate on client. Transparently. With the same application code.

- [Server Streaming](https://react.dev/reference/react-dom/server/renderToPipeableStream)

  Server-rendering will wait for all asynchronous initializers/updates outside
  of any `<Suspense/>`-boundaries to finish before sending the initial
  HTML-shell to the client. Any asynchronous initializers wrapped in a
  `<Suspense/>`-boundary will send the fallback components to the client as a
  part of the HTML-shell, and once they have completed they will be streamed to
  the client, including the stateful data, allowing for a seamless experience.

- [Error Boundary compatibility](https://react.dev/reference/react/Component#static-getderivedstatefromerror)

  Errors thrown in initializers and updates propagate to the closest
  Error Boundary, allowing for unified error-handling.

- [Small size](https://bundlephobia.com/package/@m4rw3r/react-pause-champ)

  Around 1kB gzipped without development helpers and server components. Has
  zero dependencies besides React, and can be treeshaked.

## Installation

```bash
npm install @m4rw3r/react-pause-champ
```

## Dependencies

- React 18

Recommended to use `createRoot`/`hydrateRoot` on the client to use batching. On
the server `renderToPipeableStream`/`renderToReadableStream` is required for
asynchronous initializations and Suspense support.

## Examples

```typescript
import { useChamp } from "@m4rw3r/react-pause-champ";

/**
 * Plain useState replacement with SSR-support.
 */
function Counter(): JSX.Element {
  const [data, update] = useChamp("my-counter", 0);

  return (
    <div>
      <p>{counter}</p>
      <button onClick={() => update((i) => i + 1)}>Increment</button>
    </div>
  );
}

/**
 * Isomorphic asynchronous fetch with SSR- and Suspense-support.
 */
function Page({ pageId }: { pageId: string }): JSX.Element {
  const [{ title, data }] = useChamp(`page.${pageId}`, async () => {
    const { title, data } = await fetchPageData();

    return { title: title.toUpperCase(), data };
  });

  return (
    <div>
      <h2>{title}</h2>
      <p>{data}</p>
    </div>
  );
}

/**
 * Asynchronous updates.
 */
function ServerCounter(): JSX.Element {
  const [value, update] = useChamp(
    "my-async-counter",
    async () => (await fetchCounter()).value
  );

  return (
    <div>
      <p>{value}</p>
      <button
        onClick={() =>
          update(
            async (old) =>
              (await fetchCounterUpdate({ newValue: old + 1 })).value
          )
        }
      >
        Increment
      </button>
    </div>
  );
}
```

## Frequently Asked Questions

- `Uncaught Error: State '*' is already mounted in another component.` when
  using Hot-Module-Reloading.

  This is caused by reordering components in JSX without using `key`. When
  `key` is skipped components will use the hooks from the previous component
  mounted in that "slot" instead, which will cause issues with use of
  `useState`/`useRef`/`useEffect` and so on. Pause Champ uses `useRef` to track
  component instances which can and will trigger exceptions if those values
  are not what it expects.
