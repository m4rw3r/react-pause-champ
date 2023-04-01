import { Entry, newEntry } from "./entry";
import { Init, InitFn, Update, UpdateFn } from "./useChamp";

/**
 * Placeholder for data which has been removed.
 */
export type DroppedEntry = { kind: "drop"; value: null };
/**
 * A listener for state-data updates.
 */
export type Listener<T> = (
  id: string,
  entry: Entry<T> | DroppedEntry
) => unknown;
/**
 * Function used to unregister a listener.
 */
export type UnregisterFn = () => void;

/**
 * @internal
 */
export type EntryMeta = {
  persistent: boolean;
  componentId: object;
};

/**
 * Object which is statically guaranteed to be empty.
 *
 * @internal
 */
export type EmptyObject = { [n: string]: never };

/**
 * Container for application state data.
 */
export class Store {
  /**
   * @internal
   */
  readonly _data: Map<string, Entry<any>> = new Map();
  /**
   * @internal
   */
  readonly _listeners: Map<string, Set<Listener<any>>> = new Map();
  /**
   * Developer-mode metadata for initialized entries, tracking settings and
   * attached component-instances
   *
   * @internal
   */
  _meta?: Map<string, EntryMeta>;
  /**
   * Snapshot from server-rendering, a reference to an externally defined Map
   * created by <Resume />.
   *
   * @internal
   */
  _snapshot?: Map<string, Entry<any> | null>;

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
}

/**
 * Creates a new Store from a snapshot.
 *
 * Nulls correspond to entries which we are still waiting for, and should
 * arrive once the component has finished rendering on the server.
 *
 * @see Resume
 * @see React.renderToPipeableStream
 */
export function fromSnapshot(
  snapshot: Map<string, Entry<string> | null>
): Store {
  const store = new Store();

  store._snapshot = snapshot;

  return store;
}

/**
 * @internal
 */
export function getData(store: Store): Map<string, Entry<unknown>> {
  return store._data;
}

/**
 * Assigns a Entry to the slot on `store` identified by `id`.
 *
 * If the created Entry has been replaced before the asynchronous action
 * has completed a warning will be printed and the result discarded.
 *
 * This can happen when a state is dropped during an asynchronous update, the
 * state can also be created again during that time, so we make sure that it
 * is the exact promise we are waiting for before proceeding with the update.
 *
 * @internal
 */
export function setState<T>(store: Store, id: string, entry: Entry<T>): void {
  if (process.env.NODE_ENV !== "production" && entry.kind === "suspended") {
    // If we replaced the Entry at the slot we set to, print a warning.
    const verifyCurrentEntry = () => {
      const currentEntry = store._data.get(id);

      if (currentEntry !== entry) {
        // We cannot throw here, since that will be caught by <React.Suspense/>
        // and ignored, and therefore it will not be printed.
        console.error(
          new Error(
            `Asynchronous state update of '${id}' completed after ${
              currentEntry ? "being replaced" : "drop"
            }`
          )
        );
      }
    };

    // Replace the suspended value to avoid triggering
    // unhandled promise rejection warning/exit:
    entry.value = entry.value.finally(verifyCurrentEntry);
  }

  store._data.set(id, entry);
  triggerListeners(store, id, entry);
}

/**
 * Initialize a state if not already initialized.
 *
 * @internal
 */
export function initState<T>(
  store: Store,
  id: string,
  init: Init<T>
): Entry<T> {
  let entry = store._data.get(id);

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

    setState(store, id, entry);
  }

  return entry;
}

/**
 * Attempt to update an existing state.
 */
export function updateState<T>(
  store: Store,
  id: string,
  update: Update<T>
): void {
  let entry: Entry<T> | undefined = store._data.get(id);

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

  setState(store, id, entry);
}

/**
 * Drop the state identified by `id`, will stop any active promises from
 * updating after drop.
 *
 * @internal
 */
export function dropState(store: Store, id: string) {
  store._data.delete(id);
  // TODO: Maybe add old value?
  triggerListeners(store, id, { kind: "drop", value: null });
}

/**
 * @internal
 */
export function triggerListeners<T>(
  store: Store,
  id: string,
  entry: Entry<T> | DroppedEntry
): void {
  for (const f of store._listeners.get(id) || []) {
    f(id, entry);
  }
}

/**
 * Verfies metadata for persistent and component identity in developer-mode.
 *
 * @internal
 */
export function checkMeta(
  store: Store,
  id: string,
  persistent: boolean,
  componentId: EmptyObject
) {
  if (!store._meta) {
    store._meta = new Map();
  }

  const meta = store._meta.get(id);

  if (meta) {
    if (meta.persistent !== persistent) {
      throw new Error(
        `State '${id}' is ${meta.persistent ? "" : "not "}persistent`
      );
    }

    if (!meta.persistent && meta.componentId !== componentId) {
      throw new Error(`State '${id}' is already mounted in another component`);
    }
  } else {
    store._meta.set(id, { persistent, componentId });
  }
}

/**
 * @internal
 */
export function dropMeta(store: Store, id: string): void {
  if (store._meta) {
    store._meta.delete(id);
  }
}
