import type { MutableRefObject } from "react";
import type { Store, Unregister } from "../internal/store";
import type { Init, UpdateCallback } from "../useChamp";
import type { Guard } from "../internal/hooks/useEntryValue";

import { dropEntry, listenerCount } from "../internal/store";
import { useEntryUpdate } from "../internal/hooks/useEntryUpdate";
import { useEntryValue } from "../internal/hooks/useEntryValue";
import { useStore } from "../internal/hooks/useStore";

/**
 * React hook which lets components consume a single shared state, the data will
 * be dropped once all components have unmounted.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @param initialState - The initial state of the value
 * @see {@link createSharedState}
 */
export type UseSharedState<T> = (
  initialState: Init<T>,
) => [T, UpdateCallback<T>];

/**
 * Prefix of shared states.
 *
 * @internal
 */
export const SHARED_PREFIX = "P$";

/**
 * Creates a state which will be shared by all simultaneous consumers, contents
 * will be destroyed once all the consuming components have unmounted.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 */
export function createSharedState<T = never>(id: string): UseSharedState<T> {
  return (initialState) => {
    const store = useStore("Use of shared state hook");
    // useEntryValue can fail, initialize update first
    const update = useEntryUpdate<T>(store, id);

    return [
      useEntryValue(store, SHARED_PREFIX + id, subscribeShared, initialState),
      update,
    ];
  };
}

/**
 * @internal
 */
function subscribeShared(
  store: Store,
  id: string,
  _guard: MutableRefObject<Guard | undefined>,
  unsubscribe: Unregister,
): Unregister {
  return (): void => {
    unsubscribe();

    // Same reason here for timeout as for the one found in subscribePrivate:
    // React re-renders the same component in StrictMode and HMR, so we have
    // to schedule this outside the render loop
    setTimeout(() => {
      if (listenerCount(store, id) === 0) {
        // Drop if we no longer have listeners on the id
        dropEntry(store, id);
      }
    }, 0);
  };
}
