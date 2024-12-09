import type { RefObject } from "react";
import type { Entry } from "../entry";
import type { Init, InitFn } from "../../types";
import type { Store, Unregister } from "../store";

import { useDebugValue, useEffect, useReducer, useRef } from "react";
import { createEntry, unwrapEntry } from "../entry";
import { getEntry, listen, restoreEntryFromSnapshot, setEntry } from "../store";

/**
 * Guard preventing multiple destructors from running based on object identity
 * as well as the stored id.
 *
 * @internal
 */
export interface Guard {
  id: string;
}

/**
 * Strategy used for subscribing to {@link Store} updates.
 *
 * @internal
 */
export type SubscribeStrategy = (
  store: Store,
  id: string,
  guard: RefObject<Guard | undefined>,
  callback: Unregister,
) => Unregister;

/**
 * @internal
 */
type ReducerValue<T> = [Entry<T>, Store, string];

/**
 * @internal
 */
type Reducer<T> = (prev: ReducerValue<T>) => ReducerValue<T>;

/**
 * Fetches or initializes an entry value.
 *
 * NOTE: Can throw, so must be run after other hooks.
 *
 * @internal
 */
export function useEntryValue<T>(
  store: Store,
  id: string,
  subscribeStrategy: SubscribeStrategy,
  initialState: Init<T>,
): T {
  // Guard value for cleanup callback, useRef() will remain the same even in
  // <React.StrictMode/>, which means we can use this to ensure we only clean
  // up once the component really unmounts.
  const guard = useRef<Guard | undefined>(undefined);

  // We have to track state-updates with useState/useReducer due to how React
  // is handling transitions with useSyncExternalStore.
  //
  // useSyncExternalStore forces react to perform a synchronous render, which
  // will trigger Suspense-boundaries and their fallbacks since it does not
  // have the data available to preserve the temporary component(s). It kind of
  // is in the name, with sync.
  //
  // In essence, React does not have the ability to track external data and
  // previous versions of it, so we have to manually insert it into useState for
  // React to keep track of it during transitions.
  // This also introduces some tricky updates and handling of subscriptions and
  // server snapshots.
  //
  // https://react.dev/reference/react/useSyncExternalStore#caveats
  // https://react.dev/reference/react/useTransition#starttransition-caveats
  // https://react.dev/reference/react/startTransition#caveats
  //
  // initial state callback can only be executed during hydration, or initial
  // render of the component, it never happens during updates.
  const [[savedEntry, savedStore, savedId], synchronize] = useReducer<
    Reducer<T>,
    unknown
  >(
    (prev) => {
      // We might be in the process of swapping ids with a queued synchronize,
      // ensure we reinit in that case
      const newEntry = getOrInitState(store, id, initialState);

      // Do not update if our last rendered entry is already the new one,
      // React seems to sometimes still queue updates here for some reason
      if (newEntry === prev[0] && store === prev[1] && id === prev[2]) {
        return prev;
      }

      return [newEntry, store, id];
    },
    undefined,
    () => [
      // We might be restoring from a server snapshot
      restoreEntryFromSnapshot(store, id, () =>
        getOrInitState(store, id, initialState),
      ) as Entry<T>,
      store,
      id,
    ],
  );

  // Save the current entry we rendered to avoid multiple redraws
  const entry = useRef(savedEntry);

  entry.current = savedEntry;

  if (store !== savedStore || id !== savedId) {
    // We are swapping id, so we have to immediately create or retrieve the new
    // entry to avoid tearing (new id rendered with old data in the same render).

    // NOTE: This swaps back and forth a few times during transitions, so we
    // CANNOT drop any data here, since then we will re-initialize old state
    // while replacing the component-tree with the new state.

    // Initialize the new data already in its new slot in the Store, useEffect will
    // register the listener and potentially destroy the old value (depending on the
    // subscription strategy).
    entry.current = getOrInitState(store, id, initialState);

    // Notify react that we need to synchronize the reducer contents
    synchronize();
  }

  // This subscribe/unsubscribe works fine no matter where it is in the
  // component or when it is run, since react will try to re-render the
  // component as soon as any promise is resolved. So we do not need to
  // subscribe to asynchronous updates from the store, just updates.
  //
  // Only concern we have is if any update happens in between us rendering, and
  // subscription being registered, which we catch by calling synchronize
  // before registering our listener.
  //
  // NOTE: Cleanup of the useEffect hook in a transition is executed once the
  // full transition is complete. The new state will have to have fully been
  // executed before we properly unregister the old useEffect callback.
  // It will also delay registering the new hook until the transition has
  // finished.
  //
  // Ordering in a transition with changing id and suspend:
  //
  //  1. Component(id:a) renders
  //     state: data_a
  //     store(a): data_a
  //     value: data_a
  //  2. useEffect(id:a) registers
  //  3. id: a -> b
  //  4. Component(id:a) renders again to ensure our transition is not external
  //     state: data_a
  //     store(a): data_a
  //     value: data_a
  //  5. Component(id:a -> id:b)
  //     state: data_a
  //     store(a): data_a
  //     store(b): Promise of data_b
  //     value: Promise of data_b
  //  6. React suspends on thrown promise
  //  7. Resolve on promise triggers setState(data_b)
  //     state: data_b
  //     store(a): data_a
  //     store(b): data_b
  //  8. Component(id:b -> id:a), renders YET AGAIN with old values as a sanity check?
  //     state: data_b
  //     store(a): data_a
  //     store(b): data_b
  //     value: data_a
  //  9. Component(id:a -> id:b)
  //     state: data_b
  //     store(a): data_a
  //     store(b): data_b
  //     value: data_b
  // 10. useEffect from id:a is finally unregistered
  // 11. useEffect from id:b is registered
  // 12. scheduled drop of id:a state is performed in store outside react
  //     render loop
  useEffect(() => {
    // We have to sychronize here just in case something replaced our entry
    // during render to avoid tearing:
    if (entry.current !== getEntry(store, id)) {
      synchronize();
    }

    return subscribeStrategy(store, id, guard, listen(store, id, synchronize));
  }, [store, id, guard, subscribeStrategy, synchronize]);

  // NOTE: In the case of useTransition/startTransition the entry value can
  // differ from the current entry obtained using getEntry(), despite ids being
  // identical and everything.
  //
  // This is because it seems like React first re-renders the component with
  // all-old data to make sure it has complete control, and then starts an
  // incremental render in the background with the new data, which then
  // replaces the old tree once it finishes with a final flip back and forth.

  useDebugValue(entry.current);

  // We can now unwrap since we have initialized all hooks
  return unwrapEntry(entry.current);
}

/**
 * Initialize a state if not already initialized.
 *
 * @internal
 */
export function getOrInitState<T>(
  store: Store,
  id: string,
  init: Init<T>,
): Entry<T> {
  let entry = getEntry(store, id) as Entry<T> | undefined;

  if (!entry) {
    try {
      entry = createEntry(
        typeof init === "function" ? (init as InitFn<T>)() : init,
      );
    } catch (e: unknown) {
      // If the init fails, save it and propagate it as an error into the
      // component, we are now in an error state:
      entry = { kind: "error", value: e };
    }

    setEntry(store, id, entry);
  }

  return entry;
}
