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
  stateDataIteratorNext,
  resolveState,
  triggerListeners,
} from "./internal";

/**
 * Data popluated using <Resume/>
 */
export type ResumeData = Map<string, any>;
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
export type Listener = (
  id: string,
  kind: "data" | "error" | "drop",
  value: any
) => any;
/**
 * Function used to unregister a listener.
 */
export type UnregisterFn = () => any;
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
  readonly _data: Map<string, StateData>;
  /**
   * @internal
   */
  readonly _listeners: Map<string, Set<Listener>> = new Map();

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
  unsuspend(id: string, kind: "data" | "error", value: any): void {
    if (this._data.has(id)) {
      throw new Error(`State '${id}' has already been initialized.`);
    }

    this._data.set(id, { kind, value });
  }

  /**
   * Listen to all state-updates / errors.
   *
   * Call the returned function to unregister.
   */
  registerListener(listener: Listener, id: string = "*"): UnregisterFn {
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
  initState<T>(id: string, init: Init<T>): T {
    if (!this._data.has(id)) {
      return resolveState(
        this,
        id,
        typeof init === "function" ? (init as InitFn<T>)() : init
      );
    }

    const { kind, value } = this._data.get(id)!;

    if (kind !== "data") {
      throw value;
    }

    return value;
  }

  /**
   * Attempt to update an existing state.
   */
  updateState<T>(id: string, update: Update<T>): void {
    const data = this._data.get(id);

    if (!data || data.kind !== "data") {
      throw new Error(
        `Attempted to update state '${id}' which is not initialized.`
      );
    }

    resolveState(
      this,
      id,
      typeof update === "function"
        ? (update as UpdateFn<T>)(data.value)
        : update
    );
  }

  /**
   * Drop the state identified by `id`, will stop any active promises from updating after drop.
   */
  dropState(id: string) {
    this._data.delete(id);
    triggerListeners(this, id, "drop", null);
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

  const data = storage.initState(id, init);
  // useState here to trigger re-render
  const [_, setTrigger] = useState(data);

  // TODO: Skip this call on server somehow
  useEffect(() => {
    const unlisten = storage.registerListener((_id, _kind, data) => {
      // TODO: Trigger also if we trigger async
      //if (kind === "data") {
      setTrigger(data);
      //}
    }, id);

    return () => {
      unlisten();
      // Drop state once it is no longer rendered
      storage.dropState(id);
    };
  }, [storage, id]);

  return [data, (update: Update<T>) => storage.updateState(id, update)];
}
