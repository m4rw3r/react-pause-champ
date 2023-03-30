import { useContext, useMemo, useRef, useSyncExternalStore } from "./react";
import { unwrapEntry } from "./entry";
import { Context } from "./components/Provider";

/**
 * State data initialization.
 *
 * Can either be a plain value or a maybe-async function resolving to
 * a plain value.
 */
export type Init<T> = T | InitFn<T>;
/**
 * Function creating an initial state value, can be asynchronous.
 */
export type InitFn<T> = () => T | Promise<T>;
/**
 * A state-data update.
 *
 * Can either be a plain value or a maybe-async function resolving to
 * a plain value.
 */
export type Update<T> = T | UpdateFn<T>;
/**
 * Function creating a new value from an old value, can be asynchronous.
 */
export type UpdateFn<T> = (oldValue: T) => T | Promise<T>;
/**
 * Callback to update the data in a state.
 */
export type UpdateCallback<T> = (update: Update<T>) => void;

// TODO: Any way of detecting if we are trying to reuse data initialized in
// another component? this can cause some nasty intermittent errors if
// some components are unmounting
/**
 * Create or use a state instance with the given id.
 */
export function useChamp<T>(
  id: string,
  initialState: Init<T>
): [T, UpdateCallback<T>] {
  const store = useContext(Context);

  if (!store) {
    throw new Error(`useChamp() must be inside a <Provider/>`);
  }

  // Guard value for cleanup callback, useRef() will remain the same even in
  // <React.StrictMode/>, which means we can use this to ensure we only clean
  // up once the component really unmounts.
  const guard = useRef<{ id: string }>();

  // Make sure we always pass the same functions, both to consumers to avoid
  // re-redering whole trees, but also to useSyncExternalStore() since it will
  // trigger extra logic and maybe re-render
  const { init, update, subscribe } = useMemo(
    () => ({
      // Note: Always called twice in dev to check return-value not updating
      init: () => store.initState(id, initialState),
      // Just a normal update
      update: (update: Update<T>) => store.updateState(id, update),
      // Subscribe to updates, but also drop the state-data if we are unmounting
      subscribe: (callback: () => void) => {
        const unsubscribe = store.listen(id, callback);
        // Include the id so we can ensure we still drop when they do differ
        const nonce = { id };

        // Overwrite the guard to cancel any currently scheduled drop
        guard.current = nonce;

        return () => {
          unsubscribe();

          // Drop the state outside React's render-loop, this ensures that it
          // is not dropped prematurely due to <React.StrictMode/> or
          // Hot-Module-Reloading.
          setTimeout(() => {
            // If the guard has not been modified, our component has not
            // unmounted an then immediately been mounted again which means
            // this is the last cleanup.

            // This case is also triggered if we re-render with a new id to
            // guarantee the old id gets cleaned up.
            if (
              guard.current === nonce ||
              (guard.current && guard.current.id !== id)
            ) {
              store.dropState(id);
            }
          }, 0);
        };
      },
    }),
    [store, id]
  );

  // TODO: Maybe different server snapshot?
  // Unwrap at end once we have initialized all hooks
  const value = unwrapEntry(useSyncExternalStore(subscribe, init, init));

  return [value, update];
}
