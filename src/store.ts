import { Entry } from "./entry";

/**
 * A listener for state-data updates.
 */
export type Callback = () => unknown;
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
 * A container for application state data.
 */
export interface Store {
  /**
   * State-data.
   */
  readonly data: Map<string, Entry<any>>;
  /**
   * Listeners for updates to `data`.
   *
   * @internal
   */
  readonly listeners: Map<string, Set<Callback>>;
  /**
   * Snapshot from server-rendering, a reference to an externally defined Map
   * created by <Resume />.
   *
   * @internal
   */
  readonly snapshot?: Map<string, Entry<any> | undefined> | undefined;
  /**
   * Developer-mode metadata for initialized entries, tracking settings and
   * attached component-instances
   *
   * @internal
   */
  readonly meta?: Map<string, EntryMeta>;
}

/**
 * Creates a new empty Store.
 */
export function createStore(): Store {
  return {
    data: new Map(),
    listeners: new Map(),
    ...(process.env.NODE_ENV !== "production" && { meta: new Map() }),
  };
}

/**
 * Creates a new Store from a snapshot.
 *
 * Undefined correspond to entries which we are still waiting for, and should
 * arrive once the component has finished rendering on the server.
 *
 * @see Resume
 * @see React.renderToPipeableStream
 */
export function fromSnapshot(
  snapshot: Map<string, Entry<string> | undefined> | undefined
): Store {
  return {
    data: new Map(),
    listeners: new Map(),
    snapshot,
    ...(process.env.NODE_ENV !== "production" && { meta: new Map() }),
  };
}

/**
 * Listen to state-updates / errors.
 *
 * Call the returned function to unregister.
 */
export function listen(
  store: Store,
  id: string,
  listener: Callback
): Unregister {
  if (!store.listeners.has(id)) {
    store.listeners.set(id, new Set());
  }

  store.listeners.get(id)!.add(listener);

  return () => {
    store.listeners.get(id)?.delete(listener);
  };
}

/**
 * Returns the data-entry for the given id.
 *
 * @internal
 */
export function getEntry<T>(store: Store, id: string): Entry<T> | undefined {
  return store.data.get(id);
}

/**
 * Returns the snapshot value for the given id.
 *
 * @internal
 */
export function getSnapshot(store: Store, id: string): Entry<any> | undefined {
  return store.snapshot?.get(id);
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
      const currentEntry = store.data.get(id);

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

  store.data.set(id, entry);
  triggerListeners(store, id);
}

/**
 * @internal
 */
export function restoreEntryFromSnapshot(store: Store, id: string): Entry<any> {
  // This callback should only be triggered for hydrating components,
  // which means they MUST have a server-snapshot:
  if (!store.snapshot) {
    throw new Error(`Server-snapshot is missing.`);
  }

  const value = getSnapshot(store, id);

  if (!value) {
    throw new Error(`Server-snapshot is missing '${id}'.`);
  }

  // Restore snapshot if not done already, another persistent useChamp() could
  // have already restored:
  if (!store.data.has(id)) {
    store.data.set(id, value);
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
export function dropEntry(store: Store, id: string): void {
  if (process.env.NODE_ENV !== "production") {
    store.meta?.delete(id);
  }

  store.data.delete(id);
  store.snapshot?.delete(id);

  triggerListeners(store, id);
}

/**
 * @internal
 */
export function triggerListeners(store: Store, id: string): void {
  for (const f of store.listeners.get(id) || []) {
    f();
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
): void {
  // This should be populated if we are in dev-mode
  const meta = store.meta!.get(id);

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
    store.meta!.set(id, { persistent, cid });
  }
}
