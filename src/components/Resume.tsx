import { Fragment, Suspense, createElement, useContext } from "react";

import { Context } from "./Provider";
import { Entry, newEntry, unwrapEntry } from "../entry";
import { Store } from "../store";

/**
 * Properties for creating a {@link Resume `<Resume />`} component.
 *
 * @category Component
 */
export interface ResumeProps {
  /**
   * JavaScript global variable identifier/path to store the server
   * {@link Snapshot}, eg. `"stateSnapshot"`.
   *
   * @default `"window.snapshot"`
   */
  identifier?: string | undefined;
}

/**
 * Server Side Component which streams the state data data present in the
 * wrapping {@link Provider}'s {@link Store}.
 *
 * It renders a `<script>` tag which creates a {@link Snapshot} instance, then
 * gradually populates this snapshot with state data as it gets resolved. This
 * works for asynchronous updates and streaming updates of components as well.
 *
 * This component should be rendered outside the normal application structure
 * to avoid hydration differences.
 *
 * ## Usage
 *
 * ```typescript
 * // server.js
 * <Provider store={store}>
 *   <div id="app-root">
 *     <App />
 *   </div>
 *   <Resume />
 * </Provider>
 *
 * // client.js
 * hydrateRoot(
 *   document.getElementById("app-root"),
 *   <Provider store={fromSnapshot(window.snapshot)}>
 *     <App />
 *   </Provider>
 * );
 * ```
 *
 * @category Component
 * @param props - Component properties
 * @param props.identifier - Identifier to write the snapshot to
 * @see {@link fromSnapshot} is used to restore a snapshot on the client
 * @see {@link Provider} for required wrapping {@link Store} provider
 * @see {@link react-dom!hydrateRoot} for how to hydrate the root
 * @see {@link react-dom/server!renderToPipeableStream} on how to stream the data
 * @see {@link react-dom/server!renderToReadableStream}
 */
export function Resume({
  identifier = "window.snapshot",
}: ResumeProps): JSX.Element {
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
  next: Entry<EntryIterator | undefined>;
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
  const next = unwrapEntry(iter.next);

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

  return <script async dangerouslySetInnerHTML={{ __html: parts.join(";") }} />;
}

/**
 * @internal
 */
export function stateDataIteratorNext(
  store: Store,
  emitted?: Set<string> | undefined,
  suspended?: Set<Promise<unknown>> | undefined
): EntryIterator {
  emitted = emitted ? new Set(emitted) : new Set();
  suspended = suspended ? new Set(suspended) : new Set();
  const items = new Map();
  const promises = [];

  for (const [k, v] of store.data) {
    if (v.kind === "suspended") {
      promises.push(v.value);

      // Skip emitting for promises we already have placeholders for
      if (suspended.has(v.value)) {
        continue;
      }

      suspended.add(v.value);
    } else {
      // Do not emit values or errors again, the component should have already
      // resumed on the client
      if (emitted.has(k)) {
        continue;
      }

      emitted.add(k);
    }

    items.set(k, v);
  }

  function nextIterator(): EntryIterator {
    return stateDataIteratorNext(store, emitted, suspended);
  }

  const next = newEntry(
    promises.length > 0 ? Promise.any(promises).then(nextIterator) : undefined
  );

  return {
    items,
    next,
  };
}
