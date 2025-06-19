import type { RefObject } from "react";
import type { Init, UpdateCallback } from "../types";
import type { Store, Unregister } from "../internal/store";
import type { Guard } from "../internal/hooks/useEntryValue";

import { useEffect, useRef } from "react";
import { dropEntry } from "../internal/store";
import { useEntryUpdate } from "../internal/hooks/useEntryUpdate";
import { useEntryValue } from "../internal/hooks/useEntryValue";
import { useStore } from "../internal/hooks/useStore";

/**
 * A React hook which adds stateful variables to components, with support
 * for asynchronous initialization and updates, as well as
 * server-side-rendering with ability to resume in the client.
 *
 * @remarks
 *
 * Creates a state stateful data-instance with the given identifier, which is
 * scoped to the {@link Store} instance in an ancestor {@link Provider}
 * component. This data-instance will be destroyed once the component is
 * unmounted or the `id`-parameter is changed.
 *
 * Asynchronous initializations and updates are {@link react!Suspense}
 * compatible and will trigger suspense-fallbacks. Any errors, either during
 * initialization, asynchronous initialization, updates, or asynchronous
 * updates will get caught and then re-thrown in the component, making it
 * possible to trigger an Error Boundary.
 *
 * This hook will check for a number of invariants in development-mode and
 * throws errors or warnings for things like:
 *
 *  * Mixing uses of the same id.
 *  * Asynchronous updates finishing after component being unmonted.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 *
 * @param id - Identifier for the data.
 * Must be unique within the same {@link Provider}.
 *
 * @param initialState - The initial data for the state.
 * If the parameter is a {@link InitFn | function} it will be treated as an
 * initializer and executed once during state-initialization and its
 * return-value will be the initial data.
 *
 * @returns A two-element array where the first element is the current value of
 * the stateful variable, and the second value is an
 * {@link UpdateCallback | update-function} which can be used to update the
 * state value. The parameter to the update function can either be the new
 * value, or a {@link UpdateFn | possibly-asynchronous function} which will
 * receive the current value and return the new value.
 *
 * @see {@link Provider} for required wrapping {@link Store} provider
 *
 * @see {@link Resume} for propagating data from Server Side Rendering
 *
 * @see {@link react!Suspense} to show placeholders during asyncronous
 * initializations/updates
 *
 * @see {@link react!useTransition} for how to prevent unwanted loading
 * indicators during asynchronous updates
 *
 * @see {@link https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary | React Error Boundaries}
 * for information on how to catch component errors.
 */
export function useChamp<T>(
  id: string,
  initialState: Init<T>,
): [T, UpdateCallback<T>] {
  const store = useStore("useChamp()");

  // TODO: Can we reuse some logic here?
  useCheckEntry(store, id);

  // useEntryValue can fail, initialize update first
  const update = useEntryUpdate<T>(store, id);

  return [useEntryValue(store, id, subscribePrivate, initialState), update];
}

/**
 * Check verifying the hook is only registered from one component at a time.
 *
 * @internal
 */
// TODO: Refactor and cleanup
function useCheckEntry(store: Store, id: string): void {
  // Unique object for this component instance, used to detect multiple
  // useChamp() attaching on the same id without persistent flag in
  // developer mode
  //
  // NOTE: We cannot reuse the guard-ref here since that one is initialized
  // differently.
  const cid = useRef<Record<never, never> | undefined>(undefined);

  // TODO: useEffect only runs on client, how do we check meta-info
  // on server-render?

  // When component is suspended during initialization, all hooks are
  // discarded which means we cannot do tracking inline.
  // This is never run when we suspend, so we do not have the issue
  // by using useEffect.
  useEffect(() => {
    // Unique ID when we use strict equality
    cid.current ??= {};

    const meta = store.meta.get(id);

    if (meta) {
      if (meta.cid !== cid) {
        throw new Error(
          `State '${id}' is already mounted in another component.`,
        );
      }
    } else {
      store.meta.set(id, { cid });
    }
  }, [store, id]);
}

/**
 * @internal
 */
// TODO: Refactor and cleanup
export function subscribePrivate(
  store: Store,
  id: string,
  guard: RefObject<Guard | undefined>,
  unsubscribe: Unregister,
): Unregister {
  // Include the id so we can ensure we still drop when they do differ
  const nonce = { id };

  // Overwrite the guard to cancel any currently scheduled drop
  guard.current = nonce;

  return (): void => {
    unsubscribe();

    // Drop the state outside React's render-loop, this ensures that
    // it is not dropped prematurely due to <React.StrictMode/> or
    // Hot-Module-Reloading.
    setTimeout(() => {
      // If the guard has not been modified, our component has not
      // unmounted an then immediately been mounted again which means
      // this is the last cleanup.

      // This case is also triggered if we re-render with a new id to
      // guarantee the old id gets cleaned up.
      if (guard.current === nonce || guard.current?.id !== id) {
        dropEntry(store, id);
      }
    }, 0);
  };
}
