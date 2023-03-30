import { Entry, newEntry } from "./entry";
import { Init, InitFn, Update, UpdateFn } from "./useChamp";

/**
 * Placeholder for data which has been removed.
 */
export type DroppedEntry = { kind: "drop"; value: null };
/**
 * Data popluated using <Resume/>
 */
export type ResumeData = Map<string, unknown>;
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
 * Container for application state data.
 */
export class Store {
  // TODO: Add awaiting server somehow (from <Suspense/> + <Resume/>)
  /**
   * @internal
   */
  readonly _data: Map<string, Entry<any>>;
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
  initState<T>(id: string, init: Init<T>): Entry<T> {
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
    let entry: Entry<T> | undefined = this._data.get(id);

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
  if (process.env.NODE_ENV !== "production" && entry.kind === "pending") {
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

    // Replace the pending value to avoid triggering
    // unhandled promise rejection warning/exit:
    entry.value = entry.value.finally(verifyCurrentEntry);
  }

  store._data.set(id, entry);
  triggerListeners(store, id, entry);
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
