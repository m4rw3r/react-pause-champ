import { Fragment, Suspense, createContext, createElement } from "react";
import { Storage } from "./impl";

export const enum StateKind {
  Value = "value",
  Pending = "pending",
  Error = "error",
  // Drop = "drop",
}

// TODO: Add awaiting server somehow (from <Suspense/> + <Resume/>)
// export type StateKind = "value" | "pending" | "error";
/**
 * An entry containing a value.
 */
export type StateValue<T> = { kind: StateKind.Value; value: T };
/**
 * An entry containing an error.
 */
export type StateError = { kind: StateKind.Error; value: Error };
/**
 * An entry containing a promise which wen resolved will have updated the entry.
 */
export type StatePending = { kind: StateKind.Pending; value: Promise<unknown> };
/**
 * State-data entry.
 */
export type StateData<T> = StateValue<T> | StatePending | StateError;
/**
 * Placeholder for data which has been removed.
 */
export type StateDropped = { kind: "drop"; value: null };
/**
 * @internal
 */
export interface StateDataIterator {
  items: Map<string, StateData<unknown>>;
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
  items: Map<string, StateData<unknown>>;
  createMap: boolean;
}

/**
 * @internal
 */
export const Context = createContext<Storage | null>(null);

/**
 * @internal
 */
export function getData(storage: Storage): Map<string, StateData<unknown>> {
  return storage._data;
}

/**
 * @internal
 */
export function setState<T>(
  storage: Storage,
  id: string,
  entry: StateData<T>
): StateData<T> {
  storage._data.set(id, entry);
  triggerListeners(storage, id, entry);

  return entry;
}

export function resolveStateValue<T>(
  storage: Storage,
  id: string,
  value: T | Promise<T>
): StateData<T> {
  // We cannot be in a state-transition at this point since all entrypoints to
  // this function ensure that either a) the state does not yet exist, or
  // b) the state is in "value" state.

  // Special-casing the non-promise case to avoid an extra re-render on
  // state initialization.
  if (!isThenable(value)) {
    return setState(storage, id, { kind: StateKind.Value, value });
  }

  const pending = value.then(
    (value) => setState(storage, id, { kind: StateKind.Value, value }),
    (error) => setState(storage, id, { kind: StateKind.Error, value: error })
  );

  // TODO: Merge updates when they happen quickly? To prevent re-renders?
  // Save for await/suspend
  return setState<T>(storage, id, { kind: StateKind.Pending, value: pending });
}

/**
 * @internal
 */
export function triggerListeners<T>(
  storage: Storage,
  id: string,
  entry: StateData<T> | StateDropped
): void {
  for (const f of storage._listeners.get(id) || []) {
    f(id, entry);
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
    if (emitted.has(k) || v.kind === StateKind.Pending) {
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
