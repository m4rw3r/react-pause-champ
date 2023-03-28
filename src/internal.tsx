import { StateEntry, StateDropped, StateKind } from "./index";
import { Fragment, Suspense, createContext, createElement } from "react";
import { Storage } from "./index";

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
export const Context = createContext<Storage | null>(null);

/**
 * @internal
 */
export function getData(storage: Storage): Map<string, StateEntry<unknown>> {
  return storage._data;
}

/**
 * @internal
 */
export function setState<T>(
  storage: Storage,
  id: string,
  entry: StateEntry<T>
): StateEntry<T> {
  storage._data.set(id, entry);
  triggerListeners(storage, id, entry);

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
export function guardedSetState<T>(
  storage: Storage,
  id: string,
  entry: StateEntry<T>,
  pending: Promise<any>
): StateEntry<T> {
  const currentEntry = storage._data.get(id);

  if (
    !currentEntry ||
    currentEntry.kind !== StateKind.Pending ||
    currentEntry.value !== pending
  ) {
    const error = new Error(
      `Asynchronous state update of '${id}' completed on ${
        currentEntry
          ? currentEntry.kind === StateKind.Pending &&
            currentEntry.value !== pending
            ? "reinitialized"
            : "resolved"
          : "dropped"
      } data`
    );

    // TODO: How do we properly manage this?
    console.error(error);

    throw error;
  }

  return setState(storage, id, entry);
}

/**
 * @internal
 */
export function resolveStateValue<T>(
  storage: Storage,
  id: string,
  value: T | Promise<T>
): StateEntry<T> {
  // We cannot be in a state-transition at this point since all entrypoints to
  // this function ensure that either a) the state does not yet exist, or
  // b) the state is in "value" state.

  // Special-casing the non-promise case to avoid an extra re-render on
  // state initialization.
  if (!isThenable(value)) {
    return setState(storage, id, { kind: StateKind.Value, value });
  }

  const pending: Promise<StateEntry<T>> = value.then(
    (value) =>
      guardedSetState(storage, id, { kind: StateKind.Value, value }, pending),
    (error) =>
      guardedSetState(
        storage,
        id,
        { kind: StateKind.Error, value: error },
        pending
      )
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
  entry: StateEntry<T> | StateDropped
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
): StateEntryIterator {
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

  let result: StateEntryIterator | null = null;
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
