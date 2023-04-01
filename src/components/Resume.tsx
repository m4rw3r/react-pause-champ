import { Fragment, Suspense, createElement, useContext } from "react";

import { Context } from "./Provider";
import { Entry, newEntry, unwrapEntry } from "../entry";
import { Store } from "../store";

/**
 * Properties for creating a <Resume /> component.
 */
export interface ResumeProps {
  /**
   * Java-Script global variable/path to store the server snapshot,
   * eg. `window.store`.
   */
  snapshotIdentifier: string;
}

/**
 * Component which first creates a server-snapshot `Map`, then populates this
 * map with state data as it is resolved. Compatible with
 * `renderToPipeableStream()`.
 *
 * Usage:
 *
 * ```typescript
 * // server
 * <Provider store={store}>
 *   <App />
 *   <Resume snapshotIdentifier="window.snapshot" />
 * </Provider>
 *
 * // client
 * const store = fromSnapshot(window.snapshot);
 * const container = document.getElementById('root');
 *
 * hydrateRoot(
 *   container,
 *   <Provider store={store}>
 *     <App />
 *   </Provider>
 * );
 * ```
 */
export function Resume({ snapshotIdentifier }: ResumeProps): JSX.Element {
  const store = useContext(Context);

  if (!store) {
    throw new Error(`<Weird.Resume/> must be inside a <Weird.Provider/>`);
  }

  return (
    <ResumeInner
      snapshotIdentifier={snapshotIdentifier}
      iter={stateDataIteratorNext(store)}
      createMap
    />
  );
}

/**
 * @internal
 */
export interface ResumeInnerProps {
  snapshotIdentifier: string;
  iter: EntryIterator;
  createMap?: boolean;
}

/**
 * @internal
 */
export interface ResumeNextProps {
  snapshotIdentifier: string;
  iter: EntryIterator;
}

/**
 * @internal
 */
export interface ResumeScriptProps {
  snapshotIdentifier: string;
  items: Map<string, Entry<unknown>>;
  createMap: boolean;
}

/**
 * @internal
 */
export interface EntryIterator {
  items: Map<string, Entry<unknown>>;
  next: () => EntryIterator | null;
}

/**
 * @internal
 */
export function ResumeInner({
  snapshotIdentifier,
  iter,
  createMap = false,
}: ResumeInnerProps): JSX.Element {
  const items = iter.items;

  // Gradually expand as we get finished items
  return (
    <>
      <ResumeScript
        snapshotIdentifier={snapshotIdentifier}
        items={items}
        createMap={createMap}
      />
      <Suspense>
        <ResumeNext snapshotIdentifier={snapshotIdentifier} iter={iter} />
      </Suspense>
    </>
  );
}

/**
 * @internal
 */
export function ResumeNext({
  snapshotIdentifier,
  iter,
}: ResumeNextProps): JSX.Element | null {
  const next = iter.next();

  if (!next) {
    return null;
  }

  return <ResumeInner snapshotIdentifier={snapshotIdentifier} iter={next} />;
}

/**
 * @internal
 */
export function ResumeScript({
  snapshotIdentifier,
  items,
  createMap,
}: ResumeScriptProps): JSX.Element {
  const parts = [];

  if (createMap) {
    parts.push(`${snapshotIdentifier}=new Map()`);
  }

  for (const [id, value] of items) {
    parts.push(
      `${snapshotIdentifier}.set(${JSON.stringify(id)},${
        value.kind === "suspended" ? null : JSON.stringify(value)
      })`
    );
  }

  return <script defer dangerouslySetInnerHTML={{ __html: parts.join(";") }} />;
}

/**
 * @internal
 */
export function stateDataIteratorNext(
  store: Store,
  emitted?: Set<string> | null
): EntryIterator {
  emitted = emitted ? new Set(emitted) : new Set();
  const items = new Map();
  const suspended = [];

  for (const [k, v] of store._data) {
    if (emitted.has(k)) {
      continue;
    }

    if (v.kind === "suspended") {
      suspended.push(v.value);

      continue;
    } else {
      emitted.add(k);
    }

    items.set(k, v);
  }

  function nextIterator(): EntryIterator {
    return stateDataIteratorNext(store, emitted);
  }

  const entry = newEntry(
    suspended.length > 0 ? Promise.any(suspended).then(nextIterator) : null
  );

  return {
    items,
    next: () => unwrapEntry(entry),
  };
}
