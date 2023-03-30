import type { ReactNode } from "react";
import {
  createElement,
  useContext,
  useSyncExternalStore,
  useRef,
  useMemo,
} from "react";
import {
  Context,
  ResumeInner,
  stateDataIteratorNext,
  newEntry,
  unwrapEntry,
  setState,
  triggerListeners,
} from "./internal";

// TODO: Add awaiting server somehow (from <Suspense/> + <Resume/>)
/**
 * State-data entry.
 *
 * If the entry is in the "pending" state its content will be replaced with the
 * appropriate variant once the promise resolves.
 *
 * Note: Promise resolution and entry-updates will not be notified through
 * listeners on Store.
 */
export type StateEntry<T> =
  | { kind: "value"; value: T }
  | { kind: "pending"; value: Promise<T> }
  | { kind: "error"; value: Error };
/**
 * Placeholder for data which has been removed.
 */
export type DroppedEntry = { kind: "drop"; value: null };
/**
 * Data popluated using <Resume/>
 */
export type ResumeData = Map<string, unknown>;
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
 * A listener for state-data updates.
 */
export type Listener<T> = (
  id: string,
  entry: StateEntry<T> | DroppedEntry
) => unknown;
/**
 * Function used to unregister a listener.
 */
export type UnregisterFn = () => void;

/**
 * Properties for creating a <Provider/> component.
 */
export interface ProviderProps {
  /**
   * The Store instance for the application.
   */
  store: Store;
  /**
   * Nested JSX-elements.
   */
  children?: ReactNode;
}
/**
 * Properties for creating a <Resume /> component.
 */
export interface ResumeProps {
  /**
   * Java-Script prefix to reach .unsuspend(), eg. `window.store`.
   */
  prefix: string;
}

/**
 * Container for application state data.
 */
export class Store {
  /**
   * @internal
   */
  readonly _data: Map<string, StateEntry<any>>;
  /**
   * @internal
   */
  readonly _listeners: Map<string, Set<Listener<any>>> = new Map();

  constructor(data?: ResumeData | Store | null) {
    this._data =
      data instanceof Map
        ? data
        : data instanceof Store
        ? new Map(data._data)
        : new Map();
  }

  /**
   * Attempt to add data for a state-to-be-unsuspended.
   */
  unsuspend(id: string, kind: "value" | "error", value: any): void {
    if (this._data.has(id)) {
      throw new Error(`State '${id}' has already been initialized.`);
    }

    // TODO: Any use here trying to trigger listeners?
    this._data.set(id, { kind, value });
  }

  /**
   * Listen to state-updates / errors.
   *
   * Call the returned function to unregister.
   */
  listen<T>(id: string, listener: Listener<T>): UnregisterFn {
    if (!this._listeners.has(id)) {
      this._listeners.set(id, new Set());
    }

    this._listeners.get(id)!.add(listener);

    return () => {
      if (this._listeners.has(id)) {
        this._listeners.get(id)!.delete(listener);
      }
    };
  }

  /**
   * Initialize a state if not already initialized.
   */
  initState<T>(id: string, init: Init<T>): StateEntry<T> {
    let entry = this._data.get(id);

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

      setState(this, id, entry);
    }

    return entry;
  }

  /**
   * Attempt to update an existing state.
   */
  updateState<T>(id: string, update: Update<T>): void {
    let entry: StateEntry<T> | undefined = this._data.get(id);

    if (!entry || entry.kind !== "value") {
      throw new Error(
        `State update of '${id}' requires an existing value (was ${
          !entry ? "empty" : entry.kind
        })`
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

    setState(this, id, entry);
  }

  /**
   * Drop the state identified by `id`, will stop any active promises from
   * updating after drop.
   */
  dropState(id: string) {
    this._data.delete(id);
    // TODO: Maybe add old value?
    triggerListeners(this, id, { kind: "drop", value: null });
  }
}

/**
 * A provider for the application-wide state-store.
 */
export function Provider({ store, children }: ProviderProps): JSX.Element {
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

/**
 * Component which first creates a placeholder `Map` if `prefix` is not set,
 * then populates this map or any replacing `Store` with state data as it is resolved.
 */
export function Resume({ prefix }: ResumeProps): JSX.Element {
  const store = useContext(Context);

  if (!store) {
    throw new Error(`<Weird.Resume/> must be inside a <Weird.Provider/>`);
  }

  return (
    <ResumeInner
      prefix={prefix}
      iter={stateDataIteratorNext(store)}
      createMap
    />
  );
}

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
