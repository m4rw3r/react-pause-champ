import { Fragment, Suspense, createElement, useContext } from "../react";

import { Context } from "./Provider";
import { Entry, newEntry, unwrapEntry } from "../entry";
import { Store } from "../store";

/**
 * Properties for creating a <Resume /> component.
 */
export interface ResumeProps {
  /**
   * Java-Script prefix to reach .unsuspend(), eg. `window.store`.
   */
  prefix: string;
}

/**
 * Component which first creates a placeholder `Map` if `prefix` is not set,
 * then populates this map or any replacing `Store` with state data as it is resolved.
 */
export function Resume({ prefix }: ResumeProps): JSX.Element {
  const store = useContext(Context);

  if (!store) {
    throw new Error(`<Weird.Resume/> must be inside a <Weird.Provider/>`);
  }

  return (
    <ResumeInner
      prefix={prefix}
      iter={stateDataIteratorNext(store)}
      createMap
    />
  );
}

/**
 * @internal
 */
export interface ResumeInnerProps {
  prefix: string;
  iter: EntryIterator;
  createMap?: boolean;
}

/**
 * @internal
 */
export interface ResumeNextProps {
  prefix: string;
  iter: EntryIterator;
}

/**
 * @internal
 */
export interface ResumeScriptProps {
  prefix: string;
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
export function stateDataIteratorNext(
  store: Store,
  emitted?: Set<string> | null
): EntryIterator {
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

  function nextIterator(): EntryIterator {
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
