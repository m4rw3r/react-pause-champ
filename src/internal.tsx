import { Fragment, Suspense, createContext, createElement } from "react";
import { StateEntry, DroppedEntry } from "./index";
import { Store } from "./index";

/**
 * @internal
 */
export interface StateEntryIterator {
  items: Map<string, StateEntry<unknown>>;
  next: () => StateEntryIterator | null;
}

/**
 * @internal
 */
export interface ResumeInnerProps {
  prefix: string;
  iter: StateEntryIterator;
  createMap?: boolean;
}

/**
 * @internal
 */
export interface ResumeNextProps {
  prefix: string;
  iter: StateEntryIterator;
}

/**
 * @internal
 */
export interface ResumeScriptProps {
  prefix: string;
  items: Map<string, StateEntry<unknown>>;
  createMap: boolean;
}

/**
 * @internal
 */
export const Context = createContext<Store | null>(null);

/**
 * @internal
 */
export function getData(store: Store): Map<string, StateEntry<unknown>> {
  return store._data;
}

/**
 * Assigns a StateEntry to the slot on `store` identified by `id`.
 *
 * If the created StateEntry has been replaced before the asynchronous action
 * has completed a warning will be printed and the result discarded.
 *
 * This can happen when a state is dropped during an asynchronous update, the
 * state can also be created again during that time, so we make sure that it
 * is the exact promise we are waiting for before proceeding with the update.
 *
 * @internal
 */
export function setState<T>(
  store: Store,
  id: string,
  entry: StateEntry<T>
): void {
  if (process.env.NODE_ENV !== "production" && entry.kind === "pending") {
    // If we replaced the StateEntry at the slot we set to, print a warning.
    const verifyCurrentStateEntry = () => {
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
    entry.value = entry.value.finally(verifyCurrentStateEntry);
  }

  store._data.set(id, entry);
  triggerListeners(store, id, entry);
}

/**
 * Creates a new StateEntry from the given maybe-promise. If it is a promise
 * it will be modified upon promise resolution/rejection into an appropriate
 * state.
 *
 * @internal
 */
export function newEntry<T>(value: Promise<T> | T): StateEntry<T> {
  // Special-casing the non-promise case to avoid an extra re-render on
  // state initialization.
  if (!isThenable(value)) {
    return { kind: "value", value };
  }

  const suspendable: StateEntry<T> = {
    kind: "pending",
    value: value.then(
      (value) => {
        suspendable.kind = "value";
        suspendable.value = value;

        return value;
      },
      (error) => {
        suspendable.kind = "error";
        suspendable.value = error;

        throw error;
      }
    ),
  };

  return suspendable;
}

/**
 * Extracts the contents of the entry if it is a value, otherwise an Error or
 * Promise will be thrown.
 *
 * @internal
 */
export function unwrapEntry<T>(entry: StateEntry<T>): T {
  if (entry.kind !== "value") {
    // Error or Suspense-Promise to throw
    throw entry.value;
  }

  return entry.value;
}

/**
 * @internal
 */
export function triggerListeners<T>(
  store: Store,
  id: string,
  entry: StateEntry<T> | DroppedEntry
): void {
  for (const f of store._listeners.get(id) || []) {
    f(id, entry);
  }
}

/**
 * @internal
 */
export function stateDataIteratorNext(
  store: Store,
  emitted?: Set<string> | null
): StateEntryIterator {
  emitted = emitted ? new Set(emitted) : new Set();
  const items = new Map();
  const pending = [];

  for (const [k, v] of store._data) {
    if (emitted.has(k) || v.kind === "pending") {
      pending.push(v.value);

      continue;
    }

    emitted.add(k);
    items.set(k, v);
  }

  function nextIterator(): StateEntryIterator {
    return stateDataIteratorNext(store, emitted);
  }

  const entry = newEntry(
    pending.length > 0 ? Promise.any(pending).then(nextIterator) : null
  );

  return {
    items,
    next: () => unwrapEntry(entry),
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
