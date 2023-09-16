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
 * Initial value or a function creating the initial value for a stateful
 * variable in {@link useChamp}.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @see {@link Update}
 */
export type Init<T> = T | InitFn<T>;
/**
 * A function creating an initial value for a stateful variable from
 * {@link useChamp}.
 *
 * @remarks
 * This function can also be asynchronous, either by returning a `Promise`, or
 * by using the `async` keyword.
 *
 * Any exception thrown from this function will be caught and rethrown in the
 * component. To manually handle exceptions they will have to be caught using
 * `try`-`catch` and then converted into a value.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @returns The initial value, or a promise which will resolve to the value
 * @see {@link Init}
 * @see {@link useChamp}
 */
export type InitFn<T> = () => T | Promise<T>;
/**
 * A new value, or a function creating a new value, for a stateful variable
 * from {@link useChamp}.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @see {@link Init}
 * @see {@link UpdateCallback}
 */
export type Update<T> = T | UpdateFn<T>;
/**
 * A function creating a new value for a stateful variable from
 * {@link useChamp}.
 *
 * @remarks
 * This function can also be asynchronous, either by returning a `Promise`, or
 * by using the `async` keyword.
 *
 * Any exception thrown from this function will be caught and rethrown in the
 * component. To manually handle exceptions they will have to be caught using
 * `try`-`catch` and then converted into a value.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @param oldValue - The current value of the stateful variable
 * @returns The new value, or a promise which will resolve to the new value
 * @see {@link Update}
 * @see {@link UpdateCallback}
 */
export type UpdateFn<T> = (oldValue: T) => T | Promise<T>;
/**
 * Callback which can update a stateful variable created by {@link useChamp}.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @param update - The new value, or a function creating the new value
 */
export type UpdateCallback<T> = (update: Update<T>) => void;
/**
 * Options for {@link useChamp} hook.
 *
 * @public
 * @category Hook
 */
export interface UseChampOptions {
  /**
   * If the state is persistent.
   *
   * @remarks
   * A persistent state will not get dropped when its component is unmountend,
   * and will also allow for multiple components to use the same stateful data
   * simultaneously.
   *
   * @defaultValue `true`
   */
  persistent?: boolean;
}

/**
 * A React hook which adds stateful variables to components, with support
 * for asynchronous initialization and updates, as well as
 * server-side-rendering with ability to resume in the client.
 *
 * @remarks
 *
 * Creates a state stateful data-instance with the given identifier, which is
 * scoped to the {@link Store} instance in an ancestor {@link Provider}
 * component. This data-instance will be destroyed once the component is
 * unmounted or the `id`-parameter is changed.
 *
 * Asynchronous initializations and updates are {@link react!Suspense}
 * compatible and will trigger suspense-fallbacks. Any errors, either during
 * initialization, asynchronous initialization, updates, or asynchronous
 * updates will get caught and then re-thrown in the component, making it
 * possible to trigger an Error Boundary.
 *
 * By setting the `persistent` option to `true`, multiple components can
 * simultaneously use the same state-instance and data, and they will all
 * respond to the same updates. Mixing persistent and non-persistent uses of
 * the same identifier is prohibited.
 *
 * This hook will check for a number of invariants in development-mode and
 * throws errors or warnings for things like:
 *
 *  * Mixing persistent/non-persistent uses of the same id.
 *  * mounting two non-persistent hooks with the same id simultaneously.
 *  * Asynchronous updates finishing after component being unmonted.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 *
 * @param id - Identifier for the data.
 * Must be unique within the same {@link Provider} unless
 * {@link UseChampOptions#persistent | options.persistent} is set.
 *
 * @param initialState - The initial data for the state.
 * If the parameter is a {@link InitFn | function} it will be treated as an
 * initializer and executed once during state-initialization and its
 * return-value will be the initial data.
 *
 * @param options - Optional options for the hook
 *
 * @param options.persistent - If the hook should preserve the data after
 * component dismounting.
 * This setting also allows addressing the same state id from multiple
 * components simultaneously
 *
 * @returns A two-element array where the first element is the current value of
 * the stateful variable, and the second value is an
 * {@link UpdateCallback | update-function} which can be used to update the
 * state value. The parameter to the update function can either be the new
 * value, or a {@link UpdateFn | possibly-asynchronous function} which will
 * receive the current value and return the new value.
 *
 * @see {@link Provider} for required wrapping {@link Store} provider
 *
 * @see {@link Resume} for propagating data from Server Side Rendering
 *
 * @see {@link react!Suspense} to show placeholders during asyncronous
 * initializations/updates
 *
 * @see {@link react!useTransition} for how to prevent unwanted loading
 * indicators during asynchronous updates
 *
 * @see {@link https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary | React Error Boundaries}
 * for information on how to catch component errors.
 */
export function useChamp<T>(
  id: string,
  initialState: Init<T>,
  options: UseChampOptions = {},
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
      // We have to swap to restore when we have a DOM and can hydrate, on the
      // server we have to always use initState since we do not have snapshots.
      canUseDOM()
        ? () => restoreEntryFromSnapshot(store, id) as Entry<T>
        : () => initState(store, id, initialState),
      (update: Update<T>) => updateState(store, id, update),
      (callback: () => void) =>
        subscribeState(store, id, persistent, callback, guard),
    ],
    // We do not include `initialState` in dependencies since it is only run
    // once and any changes after that should not affect anything
    [store, id, persistent, guard],
  );

  // Unwrap at end once we have initialized all hooks
  const value = unwrapEntry(
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
  );

  return [value, update];
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
 * @internal
 */
function useCheckEntry(store: Store, id: string, persistent: boolean): void {
  // Unique object for this component instance, used to detect multiple
  // useChamp() attaching on the same id without persistent flag in
  // developer mode
  const cid = useRef<Record<never, never>>();

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
  let entry = getEntry(store, id) as Entry<T> | undefined;

  if (!entry) {
    try {
      entry = newEntry(
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

/**
 * Attempt to update an existing state entry.
 *
 * @internal
 */
function updateState<T>(store: Store, id: string, update: Update<T>): void {
  let entry = getEntry(store, id) as Entry<T> | undefined;

  if (!entry || entry.kind !== "value") {
    throw new Error(
      `State update of '${id}' requires a value (was ${
        entry ? entry.kind : "empty"
      }).`,
    );
  }

  try {
    // We trigger a re-render through listeners which will then throw for
    // Suspense/ErrorBoundary in the component:
    entry = newEntry(
      typeof update === "function"
        ? (update as UpdateFn<T>)(entry.value)
        : update,
    );
  } catch (e: unknown) {
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
  guard: MutableRefObject<Guard | undefined>,
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

/**
 * @internal
 */
export function canUseDOM(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- null
      window.document &&
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Presence check
      window.document.createElement,
  );
}
