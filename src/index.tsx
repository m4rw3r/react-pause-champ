import {
  Fragment,
  Suspense,
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
} from "react";

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
  value: any,
) => any;
/**
 * A listener for state-data updates.
 */
export type ErrorListener = (id: string, error: any, oldValue: any) => any;
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
  children: JSX.Element[] | JSX.Element;
}
export interface ResumeProps {
  /**
   * Java-Script prefix to reach .unsuspendState(), eg. `window.storage.unsuspendState`.
   */
  prefix: string;
}

/**
 * Internal context type, used for testing.
 */
export const _Context = createContext<Storage | null>(null);

// TODO: Rename since it conflicts with global named Storage
/**
 * Container for application state data.
 */
export class Storage {
  readonly _data: Map<string, StateData>;
  private readonly _listeners: Map<string, Set<Listener>> = new Map();

  constructor(data?: Map<string, StateData> | Storage | null) {
    this._data = data instanceof Map ? data : (data instanceof Storage ? new Map(data._data) : new Map());
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
      return this._resolve(
        id,
        typeof init === "function" ? (init as InitFn<T>)() : init,
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
        `Attempted to update state '${id}' which is not initialized.`,
      );
    }

    this._resolve(
      id,
      typeof update === "function"
        ? (update as UpdateFn<T>)(data.value)
        : update,
    );
  }

  /**
   * Drop the state identified by `id`, will stop any active promises from updating after drop.
   */
  dropState(id: string) {
    this._data.delete(id);
    this._triggerListeners(id, "drop", null);
  }

  _resolve<T>(id: string, value: T | Promise<T>): T {
    const data = this._data.get(id);

    if (data && data.kind === "pending") {
      throw new Error(
        `Attempted to resolve a state-update in '${id}' while an existing state-update is active.`,
      );
    }

    if (!isThenable(value)) {
      // Plain value
      return this._setData(id, value);
    }

    const p = value.then(
      (d) => this._setData(id, d),
      (err) => this._setError(id, err),
    );

    this._data.set(id, { kind: "pending", value: p });

    // Await/suspend
    throw p;
  }

  _setData<T>(id: string, value: T): T {
    this._data.set(id, { kind: "data", value });
    this._triggerListeners(id, "data", value);

    return value;
  }

  _setError(id: string, error: any): void {
    this._data.set(id, { kind: "error", value: error });
    this._triggerListeners(id, "error", error);
  }

  _triggerListeners(
    id: string,
    kind: "data" | "error" | "drop",
    value: any,
  ): void {
    for (const f of this._listeners.get(id) ?? []) {
      f(id, kind, value);
    }

    for (const f of this._listeners.get("*") ?? []) {
      f(id, kind, value);
    }
  }
}

/**
 * A provider for the application-wide state-storage.
 */
export function Provider({ storage, children }: ProviderProps): JSX.Element {
  return <_Context.Provider value={storage}>{children}</_Context.Provider>;
}

/**
 * Component which first creates a placeholder `Map` if `prefix` is not set,
 * then populates this map or any replacing `Storage` with state data as it is resolved.
 */
export function Resume({ prefix }: ResumeProps): JSX.Element {
  const storage = useContext(_Context);

  if (!storage) {
    throw new Error("<Weird.Resume/> must be inside a <Weird.Provider/>");
  }

  return <ResumeInner prefix={prefix} iter={stateDataIteratorNext(storage)} createMap />;
}

/**
 * Create or use a state instance with the given id.
 */
export function useWeird<T>(id: string, init: Init<T>): [T, UpdateCallback<T>] {
  const storage = useContext(_Context);

  if (!storage) {
    throw new Error("useWeird() must be inside a <Weird.Provider/>");
  }

  // useState here to trigger re-render
  const [data, setData] = useState(storage.initState(id, init));

  // TODO: Skip this call on server somehow
  useEffect(() => {
    const unlisten = storage.registerListener((_id, kind, data) => {
      if (kind === "data") {
        setData(data);
      }
    }, id);

    return () => {
      unlisten();
      // Drop state once it is no longer rendered
      storage.dropState(id);
    };
  }, [storage, id]);

  return [data, (update: Update<T>) => storage.updateState(id, update)];
}

interface StateDataIterator {
  items: Map<string, StateData>;
  next: () => StateDataIterator | null;
}

interface StateData {
  kind: "data" | "error" | "pending";
  value: any;
}

interface ResumeInnerProps {
  prefix: string;
  iter: StateDataIterator;
  createMap?: boolean;
}

interface ResumeNextProps {
  prefix: string;
  iter: StateDataIterator;
}

interface ResumeScriptProps {
  prefix: string;
  items: Map<string, StateData>;
  createMap: boolean;
}

function stateDataIteratorNext(
  storage: Storage,
  emitted?: Set<string> | null,
): StateDataIterator {
  emitted = emitted ? new Set(emitted) : new Set();
  const items = new Map();
  const pending = [];

  for (const [k, v] of storage._data) {
    if (emitted.has(k) || v.kind === "pending") {
      pending.push(v.value);

      continue;
    }

    emitted.add(k);
    items.set(k, v);
  }

  let result: StateDataIterator | null = null;
  let suspender: Promise<any> | null =
    pending.length > 0 ? Promise.any(pending).then(done, done) : null;

  function done(): void {
    suspender = null;
    result = stateDataIteratorNext(storage, emitted);
  }

  return {
    items,
    next() {
      if (suspender) {
        throw suspender;
      }

      return result;
    },
  };
}

function ResumeInner({
  prefix,
  iter,
  createMap = false,
}: ResumeInnerProps): JSX.Element {
  const items = iter.items;

  // Gradually expand as we get finished items
  return <>
    <ResumeScript prefix={prefix} items={items} createMap={createMap}/>
    <Suspense><ResumeNext prefix={prefix} iter={iter}/></Suspense>
    </>;
}

function ResumeNext({ prefix, iter }: ResumeNextProps): JSX.Element | null {
  const next = iter.next();

  if (!next) {
    return null;
  }

  return <ResumeInner prefix={prefix} iter={next}/>
}

function ResumeScript({
  prefix,
  items,
  createMap,
}: ResumeScriptProps): JSX.Element {
  const parts = [];

  if (createMap) {
    parts.push(
      `${prefix}=new Map();${prefix}.unsuspend=function(k,v){this.set(k,v)};`,
    );
  }

  for (const [id, value] of items) {
    parts.push(
      `${prefix}.unsuspend(${JSON.stringify(id)},${JSON.stringify(value)});`,
    );
  }

  return <script defer dangerouslySetInnerHTML={{ __html: parts.join("") }} />
}

function isThenable(value: any): value is Promise<any> {
  return typeof value?.then === "function";
}
