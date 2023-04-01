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
  identifier: string;
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
 *   <Resume identifier="window.snapshot" />
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
export function Resume({ identifier }: ResumeProps): JSX.Element {
  const store = useContext(Context);

  if (!store) {
    throw new Error(`<Resume/> must be inside a <Provider/>.`);
  }

  return (
    <ResumeInner
      identifier={identifier}
      iter={stateDataIteratorNext(store)}
      createMap
    />
  );
}

/**
 * @internal
 */
export interface ResumeInnerProps {
  identifier: string;
  iter: EntryIterator;
  createMap?: boolean;
}

/**
 * @internal
 */
export interface ResumeNextProps {
  identifier: string;
  iter: EntryIterator;
}

/**
 * @internal
 */
export interface ResumeScriptProps {
  identifier: string;
  items: Map<string, Entry<unknown>>;
  createMap: boolean;
}

/**
 * @internal
 */
export interface EntryIterator {
  items: Map<string, Entry<unknown>>;
  next: () => EntryIterator | undefined;
}

/**
 * @internal
 */
export function ResumeInner({
  identifier,
  iter,
  createMap = false,
}: ResumeInnerProps): JSX.Element {
  const items = iter.items;

  // Gradually expand as we get finished items
  return (
    <>
      <ResumeScript
        identifier={identifier}
        items={items}
        createMap={createMap}
      />
      <Suspense>
        <ResumeNext identifier={identifier} iter={iter} />
      </Suspense>
    </>
  );
}

/**
 * @internal
 */
export function ResumeNext({
  identifier,
  iter,
}: ResumeNextProps): JSX.Element | null {
  const next = iter.next();

  if (!next) {
    return null;
  }

  return <ResumeInner identifier={identifier} iter={next} />;
}

/**
 * @internal
 */
export function ResumeScript({
  identifier,
  items,
  createMap,
}: ResumeScriptProps): JSX.Element {
  const parts = [];

  if (createMap) {
    parts.push(`${identifier}=new Map()`);
  }

  for (const [id, value] of items) {
    parts.push(
      `${identifier}.set(${JSON.stringify(id)},${
        value.kind === "suspended" ? "undefined" : JSON.stringify(value)
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
  emitted?: Set<string> | undefined
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
    suspended.length > 0 ? Promise.any(suspended).then(nextIterator) : undefined
  );

  return {
    items,
    next: () => unwrapEntry(entry),
  };
}