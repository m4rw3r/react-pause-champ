import { Entry } from "./entry";

/**
 * Snapshot from {@link Resume | `<Resume/>`}, to be used with
 * {@link fromSnapshot} to create a {@link Store} instance to resume
 * server-rendered state on the client.
 *
 * @remarks
 * Undefined represents data which is currently being processed at the server
 * and will be streamed by `renderToPipeableStream`/`renderToReadableStream` later.
 *
 * @public
 * @category Data
 */
export type Snapshot = Map<string, Entry<string> | undefined>;

/**
 * A container for application state data used by {@link useChamp}.
 *
 * @public
 * @category Data
 * @see {@link createStore}
 * @see {@link fromSnapshot} to restore a snapshot from {@link Resume}
 * @see {@link Provider}
 */
export interface Store {
  /**
   * State-data currently rendered, with the identifier passed to
   * {@link useChamp} as key, useful for debugging purposes. Do not modify.
   */
  readonly data: Map<string, Entry<unknown>>;
  /**
   * Listeners for updates to `data`.
   *
   * @internal
   */
  readonly listeners: Map<string, Set<Callback>>;
  /**
   * Snapshot from server-rendering, a reference to an externally defined Map
   * created by {@link Resume}.
   *
   * @internal
   */
  readonly snapshot?: Map<string, Entry<unknown> | undefined> | undefined;
  /**
   * Developer-mode metadata for initialized entries, tracking settings and
   * attached component-instances
   *
   * @internal
   */
  readonly meta: Map<string, EntryMeta>;
}

/**
 * Creates a new empty {@link Store}.
 *
 * @public
 * @category Data
 * @see {@link fromSnapshot} to create a Store from a {@link Snapshot}
 * @see {@link Provider} to add Store-data to a React component tree
 * @see {@link Resume} for propagating server-rendered state to client
 */
export function createStore(): Store {
  return {
    data: new Map(),
    listeners: new Map(),
    meta: new Map(),
  };
}

/**
 * Creates a new {@link Store} from a {@link Snapshot}.
 *
 * @remarks
 * Any updates to the Snapshot after the Store has been created will still
 * propagate to any suspended or not-yet-rendered components using
 * {@link useChamp}.
 *
 * `undefined` in the snapshot-map corresponds to entries which we are still
 * waiting for, and should arrive once the component has finished rendering on
 * the server.
 *
 * @public
 * @category Data
 * @returns A new Store instance connected to the Snapshot parameter
 * @see {@link Resume} to create the Server-Side-Rendering snapshot
 * @see {@link Provider} to provide the Store to react components
 */
export function fromSnapshot(snapshot: Snapshot | undefined): Store {
  return {
    data: new Map(),
    listeners: new Map(),
    snapshot,
    meta: new Map(),
  };
}

/**
 * A listener for state-data updates.
 *
 * @internal
 */
export type Callback = () => unknown;

/**
 * Function used to unregister a listener.
 *
 * @internal
 */
export type Unregister = () => void;

/**
 * @internal
 */
export interface EntryMeta {
  cid: object;
}

/**
 * Listen to state-updates / errors.
 *
 * Call the returned function to unregister.
 *
 * @internal
 */
export function listen(
  store: Store,
  id: string,
  listener: Callback,
): Unregister {
  const listeners = store.listeners.get(id) ?? new Set();

  if (!store.listeners.has(id)) {
    store.listeners.set(id, listeners);
  }

  listeners.add(listener);

  return () => {
    store.listeners.get(id)?.delete(listener);
  };
}

/**
 * Returns the data-entry for the given id.
 *
 * @internal
 */
export function getEntry(store: Store, id: string): Entry<unknown> | undefined {
  return store.data.get(id);
}

/**
 * Returns the snapshot value for the given id.
 *
 * @internal
 */
export function getSnapshot(
  store: Store,
  id: string,
): Entry<unknown> | undefined {
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
  if (entry.kind === "suspended") {
    // If we replaced the Entry at the slot we set to, print a warning.
    const verifyCurrentEntry = () => {
      const currentEntry = store.data.get(id);

      if (currentEntry !== entry) {
        // We cannot throw here, since that will be caught by <React.Suspense/>
        // and ignored, and therefore it will not be printed.
        console.warn(
          new Error(
            `Asynchronous state update of '${id}' completed after ${
              currentEntry ? "being replaced" : "unmount"
            }.`,
          ),
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
// TODO: Refactor if we use this pattern
export function restoreEntryFromSnapshot<T>(
  store: Store,
  id: string,
  fallback: () => Entry<T>,
): Entry<unknown> {
  // This callback should only be triggered for hydrating components,
  // which means they MUST have a server-snapshot:
  if (!store.snapshot) {
    return fallback();
    // throw new Error(`Server-snapshot is missing.`);
  }

  const value = getSnapshot(store, id);

  if (!value) {
    return fallback();
    // throw new Error(`Server-snapshot is missing '${id}'.`);
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
  store.meta.delete(id);
  store.data.delete(id);
  store.snapshot?.delete(id);

  // TODO: Do we really not forward stuff here?
  triggerListeners(store, id);
}

/**
 * @internal
 */
export function triggerListeners(store: Store, id: string): void {
  for (const f of store.listeners.get(id) ?? []) {
    f();
  }
}

/**
 * @internal
 */
export function listenerCount(store: Store, id: string): number {
  return store.listeners.get(id)?.size ?? 0;
}
