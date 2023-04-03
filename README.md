# React Pause Champ

Isomorphic Async-aware State using Suspense.

## Dependencies

* React 18

Recommended to use `createRoot`/`hydrateRoot` to use batching, in the case of
asynchronous updates which instantly complete.

## Example

```typescript
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
function Page({ pageId: string }): JSX.Element {
  const [{ title, data }] = useChamp("page", async () => {
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
```

## Frequently Asked Questions

* `Uncaught Error: State '*' is already mounted in another component.` when
  using Hot-Module-Reloading.

  This is caused by reordering components in JSX without using `key`. When
  `key` is skipped components will use the hooks from the previous component
  mounted in that "slot" instead, which will cause issues with use of
  `useState`/`useRef`/`useEffect` and so on. Pause Champ uses `useRef` to track
  component instances which can and will trigger exceptions if those values
  are not what it expects.
