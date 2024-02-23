import type { Store } from "../store";
import type { Update, UpdateCallback, UpdateFn } from "../../useChamp";
import type { Entry } from "../entry";

import { useCallback } from "react";
import { getEntry, setEntry } from "../store";
import { createEntry } from "../entry";

/**
 * Creates a callback to update the given ID in the given store.
 *
 * @internal
 */
export function useEntryUpdate<T>(store: Store, id: string): UpdateCallback<T> {
  // TODO: Allow more thorough integration so the component can immediately suspend
  return useCallback((update) => updateState(store, id, update), [store, id]);
}

/**
 * Attempt to update an existing state entry.
 *
 * @internal
 */
export function updateState<T>(
  store: Store,
  id: string,
  update: Update<T>,
): Entry<T> {
  let entry = getEntry(store, id) as Entry<T> | undefined;

  if (entry?.kind !== "value") {
    throw new Error(
      `State update of '${id}' requires a value (was ${
        entry ? entry.kind : "empty"
      }).`,
    );
  }

  try {
    // We trigger a re-render through listeners which will then throw for
    // Suspense/ErrorBoundary in the component:
    entry = createEntry(
      typeof update === "function"
        ? (update as UpdateFn<T>)(entry.value)
        : update,
    );
  } catch (e: unknown) {
    // If the update fails, propagate it as an error into the component
    entry = { kind: "error", value: e };
  }

  setEntry(store, id, entry);

  return entry;
}
