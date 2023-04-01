import { Entry } from "./entry";

/**
 * Placeholder for data which has been removed.
 */
export type DroppedEntry = { kind: "drop"; value: undefined };
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
export type Unregister = () => void;

/**
 * @internal
 */
export type EntryMeta = {
  persistent: boolean;
  cid: object;
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
  _snapshot?: Map<string, Entry<any> | undefined>;

  // TODO: Maybe make internal too? Or what are the uses for developer-mode?
  /**
   * Listen to state-updates / errors.
   *
   * Call the returned function to unregister.
   */
  listen<T>(id: string, listener: Listener<T>): Unregister {
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
  snapshot: Map<string, Entry<string> | undefined>
): Store {
  const store = new Store();

  store._snapshot = snapshot;

  return store;
}

/**
 * @internal
 */
export function getEntry<T>(store: Store, id: string): Entry<T> | undefined {
  return store._data.get(id);
}

/**
 * @internal
 */
export function getSnapshot(store: Store, id: string): Entry<any> | undefined {
  return store._snapshot?.get(id);
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
export function setEntry<T>(store: Store, id: string, entry: Entry<T>): void {
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
              currentEntry ? "being replaced" : "unmount"
            }.`
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
 * @internal
 */
export function restoreEntryFromSnapshot(store: Store, id: string): Entry<any> {
  // This callback should only be triggered for hydrating components,
  // which means they MUST have a server-snapshot:
  if (!store._snapshot) {
    throw new Error(`Server-snapshot is missing.`);
  }

  const value = getSnapshot(store, id);

  if (!value) {
    throw new Error(`Server-snapshot is missing '${id}'.`);
  }

  // Restore snapshot if not done already, another persistent useChamp() could
  // have already restored:
  if (!store._data.has(id)) {
    store._data.set(id, value);
  }

  // We do not trigger any listeners here, since listeners are installed after
  // restoration is done
  return value;
}

/**
 * Drop the state identified by `id`, will stop any active promises from
 * updating after drop.
 *
 * @internal
 */
export function dropEntry(store: Store, id: string) {
  if (process.env.NODE_ENV !== "production") {
    dropMeta(store, id);
  }

  store._data.delete(id);
  store._snapshot?.delete(id);
  // TODO: Maybe add old value?
  triggerListeners(store, id, { kind: "drop", value: undefined });
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
export function checkEntry(
  store: Store,
  id: string,
  persistent: boolean,
  cid: EmptyObject
) {
  if (!store._meta) {
    store._meta = new Map();
  }

  const meta = store._meta.get(id);

  if (meta) {
    if (meta.persistent !== persistent) {
      throw new Error(
        `State '${id}' is ${meta.persistent ? "" : "not "}persistent.`
      );
    }

    if (!meta.persistent && meta.cid !== cid) {
      throw new Error(`State '${id}' is already mounted in another component.`);
    }
  } else {
    store._meta.set(id, { persistent, cid });
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
