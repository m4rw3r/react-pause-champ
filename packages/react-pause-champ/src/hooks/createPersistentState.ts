import type { MutableRefObject } from "react";
import type { Store, Unregister } from "../internal/store";
import type { Init, UpdateCallback } from "../useChamp";
import type { Guard } from "../internal/hooks/useEntryValue";

import { useEntryUpdate } from "../internal/hooks/useEntryUpdate";
import { useEntryValue } from "../internal/hooks/useEntryValue";
import { useStore } from "../internal/hooks/useStore";

/**
 * React hook which lets components use the same state across multiple
 * components, with the data persisting across component umounts.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 */
export type UsePersistentState<T> = (
  initialState: Init<T>,
) => [T, UpdateCallback<T>];

/**
 * Prefix of persistent states.
 *
 * @internal
 */
export const PERSISTENT_PREFIX = "P$";

/**
 * Creates a typed persistent state with the given id, this state can be used
 * simultaneously in multiple components which then shares the state data and
 * respond to the same updates.
 *
 * WARNING: Do not create multiple instances of a persistent state with the same
 * id but with different types. This can cause unintentional mixing of data
 * of different types, leading to unpredictable behaviour and crashes.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 *
 * @example
 * ```
 * const usePage = createPeristentState<PageName>("page");
 *
 * function MyComponent(): JSX.Element {
 *   const [page, setPage] = usePage("defaultPage");
 *
 *   return (
 *     <div>
 *       <ol>
 *         <li onClick={() => setPage("foo")}>Foo</li>
 *         <li onClick={() => setPage("bar")}>Bar</li>
 *       </ol>
 *       <Page name={page} />
 *     </div>
 *   );
 * }
 * ```
 */
// The never type is used here to make sure we actually provide a type if we
// try to use it, unknown might be too permissive.
export function createPersistentState<T = never>(
  id: string,
): UsePersistentState<T> {
  return (initialState) => {
    const store = useStore("Use of persistent state hook");
    // useEntryValue can fail, initialize update first
    const update = useEntryUpdate<T>(store, id);

    return [
      useEntryValue(
        store,
        PERSISTENT_PREFIX + id,
        subscribePersistent,
        initialState,
      ),
      update,
    ];
  };
}

/**
 * @internal
 */
function subscribePersistent(
  _store: Store,
  _id: string,
  _guard: MutableRefObject<Guard | undefined>,
  callback: Unregister,
): Unregister {
  return callback;
}
