import {
  ReactNode,
  createElement,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  Context,
  ResumeInner,
  StateData,
  StateDropped,
  StateKind,
  stateDataIteratorNext,
  setState,
  resolveStateValue,
  triggerListeners,
} from "./internal";

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
  entry: StateData<T> | StateDropped
) => unknown;
/**
 * Function used to unregister a listener.
 */
export type UnregisterFn = () => void;
/**
 * Properties for creating a Provider.
 */
export interface ProviderProps {
  /**
   * The storage instance for the application.
   */
  storage: Storage;
  /**
   * Nested JSX-elements.
   */
  children?: ReactNode;
}
export interface ResumeProps {
  /**
   * Java-Script prefix to reach .unsuspendState(), eg. `window.storage.unsuspendState`.
   */
  prefix: string;
}

// TODO: Rename since it conflicts with global named Storage
/**
 * Container for application state data.
 */
export class Storage {
  /**
   * @internal
   */
  readonly _data: Map<string, StateData<any>>;
  /**
   * @internal
   */
  readonly _listeners: Map<string, Set<Listener<any>>> = new Map();

  constructor(data?: ResumeData | Storage | null) {
    this._data =
      data instanceof Map
        ? data
        : data instanceof Storage
        ? new Map(data._data)
        : new Map();
  }

  /**
   * Attempt to add data for a state-to-be-unsuspended.
   */
  unsuspend(id: string, kind: StateKind, value: any): void {
    if (this._data.has(id)) {
      throw new Error(`State '${id}' has already been initialized.`);
    }

    // TODO: Any use here trying to trigger listeners?
    this._data.set(id, { kind, value });
  }

  /**
   * Listen to all state-updates / errors.
   *
   * Call the returned function to unregister.
   */
  registerListener<T>(listener: Listener<T>, id: string = "*"): UnregisterFn {
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
  initState<T>(id: string, init: Init<T>): StateData<T> {
    const entry = this._data.get(id);

    if (entry) {
      return entry;
    }

    try {
      return resolveStateValue(
        this,
        id,
        typeof init === "function" ? (init as InitFn<T>)() : init
      );
    } catch (e: any) {
      // If the init fails, save it and propagate it as an error into the component, we are now in
      // an error state:
      return setState(this, id, { kind: "error", value: e });
    }
  }

  /**
   * Attempt to update an existing state.
   */
  updateState<T>(id: string, update: Update<T>): void {
    const entry = this._data.get(id);

    if (!entry || entry.kind !== "value") {
      throw new Error(
        `Attempted to update state '${id}' which does not have a value (was '${
          !entry ? "uninitialized" : entry.kind
        }').`
      );
    }

    try {
      // We trigger a re-render through listeners which will then throw for Suspense/ErrorBoundary:
      resolveStateValue(
        this,
        id,
        typeof update === "function"
          ? (update as UpdateFn<T>)(entry.value)
          : update
      );
    } catch (e: any) {
      // If the update fails, propagate it as an error into the component
      setState(this, id, { kind: "error", value: e });
    }
  }

  /**
   * Drop the state identified by `id`, will stop any active promises from updating after drop.
   */
  dropState(id: string) {
    this._data.delete(id);
    // TODO: Maybe add old value?
    triggerListeners(this, id, { kind: "drop", value: null });
  }
}

/**
 * A provider for the application-wide state-storage.
 */
export function Provider({ storage, children }: ProviderProps): JSX.Element {
  return <Context.Provider value={storage}>{children}</Context.Provider>;
}

/**
 * Component which first creates a placeholder `Map` if `prefix` is not set,
 * then populates this map or any replacing `Storage` with state data as it is resolved.
 */
export function Resume({ prefix }: ResumeProps): JSX.Element {
  const storage = useContext(Context);

  if (!storage) {
    throw new Error("<Weird.Resume/> must be inside a <Weird.Provider/>");
  }

  return (
    <ResumeInner
      prefix={prefix}
      iter={stateDataIteratorNext(storage)}
      createMap
    />
  );
}

/**
 * Create or use a state instance with the given id.
 */
export function useWeird<T>(id: string, init: Init<T>): [T, UpdateCallback<T>] {
  const storage = useContext(Context);

  if (!storage) {
    throw new Error("useWeird() must be inside a <Weird.Provider/>");
  }

  // useState() here to trigger re-render
  // We do not have to re-read the data from storage since the listener is updating
  // the state and React 18 is batching state-updates inside promises and timers
  const [entry, setEntry] = useState<StateData<T>>(() =>
    storage.initState(id, init)
  );

  // TODO: Skip this call on server somehow
  // TODO: Fix issue caused by re-rendering in React.StrictMode which causes it to remove the state
  useEffect(() => {
    const unlisten = storage.registerListener<T>((_id, newEntry) => {
      if (newEntry.kind === "drop") {
        // FIXME: Ensure this never happens:
        // We fucked up, we need to reinit:
        setEntry({
          kind: "error",
          value: new Error(
            `State '${id}' got dropped while we were listening.`
          ),
        });
      } else {
        setEntry(newEntry);
      }
    }, id);

    return () => {
      unlisten();
      // Drop state once it is no longer rendered
      storage.dropState(id);
    };
  }, [storage, id]);

  // Throw at end once we have initialized all hooks
  if (entry.kind !== "value") {
    // Error or Suspense-Promise to throw
    throw entry.value;
  }

  // TODO: useCallback()
  return [entry.value, (update: Update<T>) => storage.updateState(id, update)];
}
