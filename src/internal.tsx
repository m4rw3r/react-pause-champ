import { Fragment, Suspense, createContext, createElement } from "react";
import { Storage } from "./impl";

// TODO: Add awaiting server somehow (from <Suspense/> + <Resume/>)
export type StateKind = "value" | "pending" | "error";
/**
 * @internal
 */
export type StateValue<T> = { kind: "value"; value: T };
/**
 * @internal
 */
export type StateError = { kind: "error"; value: Error };
/**
 * @internal
 */
export type StatePending<T> = { kind: "pending"; value: Promise<StateData<T>> };

/**
 * @internal
 */
export type StateData<T> = StateValue<T> | StatePending<T> | StateError;
/**
 * @internal
 */
export interface StateDataIterator {
  items: Map<string, StateData<any>>;
  next: () => StateDataIterator | null;
}

/**
 * @internal
 */
export interface ResumeInnerProps {
  prefix: string;
  iter: StateDataIterator;
  createMap?: boolean;
}

/**
 * @internal
 */
export interface ResumeNextProps {
  prefix: string;
  iter: StateDataIterator;
}

/**
 * @internal
 */
export interface ResumeScriptProps {
  prefix: string;
  items: Map<string, StateData<any>>;
  createMap: boolean;
}

/**
 * @internal
 */
export const Context = createContext<Storage | null>(null);

/**
 * @internal
 */
export function getData(storage: Storage): Map<string, StateData<any>> {
  return storage._data;
}

/**
 * @internal
 */
export function setState<T>(
  storage: Storage,
  id: string,
  kind: "value",
  value: T
): StateData<T>;
export function setState<T>(
  storage: Storage,
  id: string,
  kind: "pending",
  value: Promise<StateData<T>>
): StateData<T>;
export function setState(
  storage: Storage,
  id: string,
  kind: "error",
  value: Error
): StateData<any>;
export function setState<T>(
  storage: Storage,
  id: string,
  kind: StateKind,
  value: any
): StateData<T> {
  const entry = { kind, value };
  storage._data.set(id, entry);
  triggerListeners(storage, id, kind, value);
  return entry;
}

/**
 * @internal
 */
export function resolveState<T>(
  storage: Storage,
  id: string,
  value: T | Promise<T>
): StateData<T> {
  const data = storage._data.get(id);

  if (data && data.kind === "pending") {
    throw new Error(
      `Attempted to resolve a state-update in '${id}' while an existing state-update is active.`
    );
  }

  if (!isThenable(value)) {
    // Plain value
    return setState(storage, id, "value", value);
  }

  const p: Promise<StateData<T>> = value.then(
    (d) => setState(storage, id, "value", d),
    (err) => setState(storage, id, "error", err)
  );

  // Await/suspend
  return setState(storage, id, "pending", p);
}

/**
 * @internal
 */
export function triggerListeners(
  storage: Storage,
  id: string,
  kind: StateKind | "drop",
  value: any
): void {
  for (const f of storage._listeners.get(id) || []) {
    f(id, kind, value);
  }

  for (const f of storage._listeners.get("*") || []) {
    f(id, kind, value);
  }
}

/**
 * @internal
 */
export function stateDataIteratorNext(
  storage: Storage,
  emitted?: Set<string> | null
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

/**
 * @internal
 */
export function ResumeInner({
  prefix,
  iter,
  createMap = false,
}: ResumeInnerProps): JSX.Element {
  const items = iter.items;

  // Gradually expand as we get finished items
  return (
    <>
      <ResumeScript prefix={prefix} items={items} createMap={createMap} />
      <Suspense>
        <ResumeNext prefix={prefix} iter={iter} />
      </Suspense>
    </>
  );
}

/**
 * @internal
 */
export function ResumeNext({
  prefix,
  iter,
}: ResumeNextProps): JSX.Element | null {
  const next = iter.next();

  if (!next) {
    return null;
  }

  return <ResumeInner prefix={prefix} iter={next} />;
}

/**
 * @internal
 */
export function ResumeScript({
  prefix,
  items,
  createMap,
}: ResumeScriptProps): JSX.Element {
  const parts = [];

  if (createMap) {
    parts.push(
      `${prefix}=new Map();${prefix}.unsuspend=function(k,v){this.set(k,v)};`
    );
  }

  for (const [id, value] of items) {
    parts.push(
      `${prefix}.unsuspend(${JSON.stringify(id)},${JSON.stringify(value)});`
    );
  }

  return <script defer dangerouslySetInnerHTML={{ __html: parts.join("") }} />;
}

/**
 * @internal
 */
export function isThenable(value: any): value is Promise<any> {
  return typeof value?.then === "function";
}
