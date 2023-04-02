import {
  MutableRefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { Context } from "./components/Provider";
import { Entry, newEntry, unwrapEntry } from "./entry";
import {
  Store,
  Unregister,
  listen,
  getEntry,
  setEntry,
  restoreEntryFromSnapshot,
  dropEntry,
  checkEntry,
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
 * Guard preventing multiple destructors from running based on object identity
 * as well as the stored id.
 *
 * @internal
 */
interface Guard {
  id: string;
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
    throw new Error(`useChamp() must be inside a <Provider/>.`);
  }

  const { persistent = false } = options;

  if (process.env.NODE_ENV !== "production") {
    useCheckEntry(store, id, persistent);
  }

  // Guard value for cleanup callback, useRef() will remain the same even in
  // <React.StrictMode/>, which means we can use this to ensure we only clean
  // up once the component really unmounts.
  const guard = useRef<Guard>();

  // Make sure we always pass the same functions, both to consumers to avoid
  // re-redering whole trees, but also to useSyncExternalStore() since it will
  // trigger extra logic and maybe re-render
  const [getSnapshot, getServerSnapshot, update, subscribe] = useMemo(
    () => [
      () => initState(store, id, initialState),
      () => restoreEntryFromSnapshot(store, id),
      (update: Update<T>) => updateState(store, id, update),
      (callback: () => void) =>
        subscribeState(store, id, persistent, callback, guard),
    ],
    [store, id, persistent]
  );

  // Unwrap at end once we have initialized all hooks
  const value = unwrapEntry(
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  );

  return [value, update];
}

/**
 * @internal
 */
function useCheckEntry(store: Store, id: string, persistent: boolean): void {
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

    checkEntry(store, id, persistent, cid.current);
  }, [store, id, persistent]);
}

/**
 * Initialize a state if not already initialized.
 *
 * @internal
 */
function initState<T>(store: Store, id: string, init: Init<T>): Entry<T> {
  let entry: Entry<T> | undefined = getEntry(store, id);

  if (!entry) {
    try {
      entry = newEntry(
        typeof init === "function" ? (init as InitFn<T>)() : init
      );
    } catch (e: any) {
      // If the init fails, save it and propagate it as an error into the
      // component, we are now in an error state:
      entry = { kind: "error", value: e };
    }

    setEntry(store, id, entry);
  }

  return entry;
}

/**
 * Attempt to update an existing state entry.
 *
 * @internal
 */
function updateState<T>(store: Store, id: string, update: Update<T>): void {
  let entry = getEntry<T>(store, id);

  if (!entry || entry.kind !== "value") {
    throw new Error(
      `State update of '${id}' requires a value (was ${
        !entry ? "empty" : entry.kind
      }).`
    );
  }

  try {
    // We trigger a re-render through listeners which will then throw for
    // Suspense/ErrorBoundary in the component:
    entry = newEntry(
      typeof update === "function"
        ? (update as UpdateFn<T>)(entry.value)
        : update
    );
  } catch (e: any) {
    // If the update fails, propagate it as an error into the component
    entry = { kind: "error", value: e };
  }

  setEntry(store, id, entry);
}

/**
 * @internal
 */
function subscribeState(
  store: Store,
  id: string,
  persistent: boolean,
  callback: Unregister,
  guard: MutableRefObject<Guard | undefined>
): Unregister {
  // Subscribe to updates, but also drop the state-data if we are unmounting
  const unsubscribe = listen(store, id, callback);
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
        dropEntry(store, id);
      }
    }, 0);
  };

  // If we are a persistent state, just return the plain unsubscribe
  // since we will not drop the state entry.
  return persistent ? unsubscribe : drop;
}
