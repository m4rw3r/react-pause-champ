import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { unwrapEntry } from "./entry";
import { Context } from "./components/Provider";
import {
  initState,
  updateState,
  dropState,
  checkMeta,
  dropMeta,
} from "./store";

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
/**
 * Options for useChamp().
 */
export interface UseChampOptions {
  /**
   * If the state is persistent. A persistent state will not get dropped when
   * its component is unmountend, and will also allow for multiple components
   * using the same state simultaneously.
   */
  persistent?: boolean;
}

/**
 * Create or use a state instance with the given id.
 */
export function useChamp<T>(
  id: string,
  initialState: Init<T>,
  options: UseChampOptions = {}
): [T, UpdateCallback<T>] {
  const store = useContext(Context);

  if (!store) {
    throw new Error(`useChamp() must be inside a <Provider/>`);
  }

  const { persistent = false } = options;

  if (process.env.NODE_ENV !== "production") {
    // Unique object for this component instance, used to detect multiple
    // useChamp() attaching on the same id without persistent flag in
    // developer mode
    const cid = useRef<{}>();

    // TODO: useEffect only runs on client, how do we check meta-info
    // on server-render?

    // When component is suspended during initialization, all hooks are
    // discarded which means we cannot do tracking inline.
    // This is never run when we suspend, so we do not have the issue
    // by using useEffect.
    useEffect(() => {
      if (!cid.current) {
        // Unique ID when we use strict equality
        cid.current = {};
      }

      checkMeta(store, id, persistent, cid.current);
    }, [store, id, persistent]);
  }

  // Guard value for cleanup callback, useRef() will remain the same even in
  // <React.StrictMode/>, which means we can use this to ensure we only clean
  // up once the component really unmounts.
  const guard = useRef<{ id: string }>();

  // Make sure we always pass the same functions, both to consumers to avoid
  // re-redering whole trees, but also to useSyncExternalStore() since it will
  // trigger extra logic and maybe re-render
  const { getSnapshot, getServerSnapshot, update, subscribe } = useMemo(
    () => ({
      getSnapshot: () => initState(store, id, initialState),
      getServerSnapshot: () => {
        // This callback should only be triggered for hydrating components,
        // which means they MUST have a server-snapshot:
        if (!store._snapshot) {
          throw new Error(`Expected store to have a server-snapshot`);
        }

        const value = store._snapshot.get(id);

        if (!value) {
          throw new Error(`Server-snapshot missing '${id}'`);
        }

        return value;
      },
      update: (update: Update<T>) => updateState(store, id, update),
      subscribe: (callback: () => void) => {
        // Subscribe to updates, but also drop the state-data if we are unmounting
        const unsubscribe = store.listen(id, callback);
        // Include the id so we can ensure we still drop when they do differ
        const nonce = { id };

        // Overwrite the guard to cancel any currently scheduled drop
        guard.current = nonce;

        const drop = (): void => {
          unsubscribe();

          // Drop the state outside React's render-loop, this ensures that
          // it is not dropped prematurely due to <React.StrictMode/> or
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
              if (process.env.NODE_ENV !== "production") {
                dropMeta(store, id);
              }

              dropState(store, id);
            }
          }, 0);
        };

        // If we are a persistent state, just return the plain unsubscribe
        // since we will not drop the state entry.
        return persistent ? unsubscribe : drop;
      },
    }),
    [store, id, persistent]
  );

  // Unwrap at end once we have initialized all hooks
  const value = unwrapEntry(
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  );

  return [value, update];
}
