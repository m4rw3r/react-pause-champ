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
 * @internal
 */
export function setState<T>(
  store: Store,
  id: string,
  entry: StateEntry<T>
): StateEntry<T> {
  store._data.set(id, entry);
  triggerListeners(store, id, entry);

  return entry;
}

/**
 * @internal
 *
 * Guarded version of setState() which ensures we do not try to update state
 * data asynchronously if that data has already been completed or changed. It
 * will warn and discard the result.
 *
 * This can happen when a state is dropped during an asynchronous update, the
 * state can also be created again during that time, so we make sure that it
 * is the exact promise we are waiting for before proceeding with the update.
 */
export function resolveState<T>(
  store: Store,
  id: string,
  entry: StateEntry<T>,
  pending: Promise<any>
): StateEntry<T> {
  const currentEntry = store._data.get(id);

  if (
    !currentEntry ||
    currentEntry.kind !== "pending" ||
    currentEntry.value !== pending
  ) {
    const error = new Error(
      `Asynchronous state update of '${id}' completed on ${
        currentEntry
          ? currentEntry.kind === "pending" && currentEntry.value !== pending
            ? "reinitialized"
            : "resolved"
          : "dropped"
      } data`
    );

    // TODO: How do we properly manage this?
    console.error(error);

    throw error;
  }

  return setState(store, id, entry);
}

/**
 * @internal
 */
export function resolveStateValue<T>(
  store: Store,
  id: string,
  value: T | Promise<T>
): StateEntry<T> {
  // We cannot be in a state-transition at this point since all entrypoints to
  // this function ensure that either a) the state does not yet exist, or
  // b) the state is in "value" state.

  // Special-casing the non-promise case to avoid an extra re-render on
  // state initialization.
  if (!isThenable(value)) {
    return setState(store, id, { kind: "value", value });
  }

  const pending: Promise<StateEntry<T>> = value.then(
    (value) => resolveState(store, id, { kind: "value", value }, pending),
    (error) => resolveState(store, id, { kind: "error", value: error }, pending)
  );

  // TODO: Merge updates when they happen quickly? To prevent re-renders?
  // Save for await/suspend
  return setState<T>(store, id, { kind: "pending", value: pending });
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

  let result: StateEntryIterator | null = null;
  let suspender: Promise<any> | null =
    pending.length > 0 ? Promise.any(pending).then(done, done) : null;

  function done(): void {
    suspender = null;
    result = stateDataIteratorNext(store, emitted);
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
