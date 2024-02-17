import {
  MutableRefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  // useSyncExternalStore,
  useState,
} from "react";
import { Context } from "./components/Provider";
import { Entry, createEntry, unwrapEntry } from "./entry";
import {
  Store,
  Unregister,
  listen,
  listenerCount,
  getEntry,
  setEntry,
  restoreEntryFromSnapshot,
  dropEntry,
} from "./store";

/**
 * Initial value or a function creating the initial value for a stateful
 * variable in {@link useChamp}.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @see {@link Update}
 */
export type Init<T> = T | InitFn<T>;
/**
 * A function creating an initial value for a stateful variable from
 * {@link useChamp}.
 *
 * @remarks
 * This function can also be asynchronous, either by returning a `Promise`, or
 * by using the `async` keyword.
 *
 * Any exception thrown from this function will be caught and rethrown in the
 * component. To manually handle exceptions they will have to be caught using
 * `try`-`catch` and then converted into a value.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @returns The initial value, or a promise which will resolve to the value
 * @see {@link Init}
 * @see {@link useChamp}
 */
export type InitFn<T> = () => T | Promise<T>;
/**
 * A new value, or a function creating a new value, for a stateful variable
 * from {@link useChamp}.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @see {@link Init}
 * @see {@link UpdateCallback}
 */
export type Update<T> = T | Promise<T> | UpdateFn<T>;
/**
 * A function creating a new value for a stateful variable from
 * {@link useChamp}.
 *
 * @remarks
 * This function can also be asynchronous, either by returning a `Promise`, or
 * by using the `async` keyword.
 *
 * Any exception thrown from this function will be caught and rethrown in the
 * component. To manually handle exceptions they will have to be caught using
 * `try`-`catch` and then converted into a value.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @param oldValue - The current value of the stateful variable
 * @returns The new value, or a promise which will resolve to the new value
 * @see {@link Update}
 * @see {@link UpdateCallback}
 */
export type UpdateFn<T> = (oldValue: T) => T | Promise<T>;
/**
 * Callback which can update a stateful variable created by {@link useChamp}.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @param update - The new value, or a function creating the new value
 */
export type UpdateCallback<T> = (update: Update<T>) => void;

export type UsePersistentLazyState<T> = () => [T, UpdateCallback<T>];

export type UsePersistentState<T> = (
  initialState: Init<T>,
) => [T, UpdateCallback<T>];

export type UseSharedState<T> = (
  initialState: Init<T>,
) => [T, UpdateCallback<T>];

/**
 * Prefix of persistent states.
 *
 * @internal
 */
export const PERSISTENT_PREFIX = "P$";
/**
 * Prefix of shared states.
 *
 * @internal
 */
export const SHARED_PREFIX = "P$";

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
 * By setting the `persistent` option to `true`, multiple components can
 * simultaneously use the same state-instance and data, and they will all
 * respond to the same updates. Mixing persistent and non-persistent uses of
 * the same identifier is prohibited.
 *
 * This hook will check for a number of invariants in development-mode and
 * throws errors or warnings for things like:
 *
 *  * Mixing persistent/non-persistent uses of the same id.
 *  * mounting two non-persistent hooks with the same id simultaneously.
 *  * Asynchronous updates finishing after component being unmonted.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 *
 * @param id - Identifier for the data.
 * Must be unique within the same {@link Provider} unless
 * {@link UseChampOptions#persistent | options.persistent} is set.
 *
 * @param initialState - The initial data for the state.
 * If the parameter is a {@link InitFn | function} it will be treated as an
 * initializer and executed once during state-initialization and its
 * return-value will be the initial data.
 *
 * @param options - Optional options for the hook
 *
 * @param options.persistent - If the hook should preserve the data after
 * component dismounting.
 * This setting also allows addressing the same state id from multiple
 * components simultaneously
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
  return pauseChamp(id, useCheckEntry, subscribePrivate, initialState);
}

/**
 * Creates a typed persistent state with the given id.
 *
 * WARNING: Do not create multiple instances of a persistent state with the same
 * id but with different types. This can cause unintentional mixing of data
 * of different types, leading to unpredictable behaviour and crashes.
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
  return (initialState) =>
    pauseChamp(
      PERSISTENT_PREFIX + id,
      () => {},
      subscribePersistent,
      initialState,
    );
}

// TODO: Is this a good pattern? Is it even usable really considering it
// cannot use anything from the component tree?
/**
 * ```
 * const useUser = createPersistentLazyState<User>("user", fetchUser);
 *
 * function UserProfile(): JSX.Element {
 *   const [user] = useUser();
 * }
 * ```
 */
export function createPersistentLazyState<T = never>(
  id: string,
  initialState: InitFn<T>,
): UsePersistentLazyState<T> {
  return () =>
    pauseChamp(
      PERSISTENT_PREFIX + id,
      () => {},
      subscribePersistent,
      initialState,
    );
}

// TODO: Is this a good pattern?
export function createSharedState<T = never>(id: string): UseSharedState<T> {
  return (initialState) =>
    pauseChamp(SHARED_PREFIX + id, () => {}, subscribeShared, initialState);
}

/**
 * Strategy used for subscribing to {@link Store} updates.
 *
 * @internal
 */
type SubscribeStrategy = (
  store: Store,
  id: string,
  guard: MutableRefObject<Guard | undefined>,
  callback: Unregister,
) => Unregister;

type CheckStrategy = (
  store: Store,
  id: string,
  guard: Readonly<MutableRefObject<Guard | undefined>>,
) => void;

/**
 */

// TODO: Behaviour hooks
// TODO: Semi-internal?
export function pauseChamp<T>(
  id: string,
  useCheckEntry: CheckStrategy,
  subscribeStrategy: SubscribeStrategy,
  initialState: Init<T>,
): [T, UpdateCallback<T>] {
  const store = useContext(Context);

  if (!store) {
    throw new Error(`useChamp() must be inside a <Provider/>.`);
  }

  // Guard value for cleanup callback, useRef() will remain the same even in
  // <React.StrictMode/>, which means we can use this to ensure we only clean
  // up once the component really unmounts.
  const guard = useRef<Guard>();

  useCheckEntry(store, id, guard);

  const [getEntry, update, getInitialEntry] = useMemo(
    () => [
      () => initState(store, id, initialState),
      (update: Update<T>) => updateState(store, id, update),
      () =>
        restoreEntryFromSnapshot(store, id, () =>
          initState(store, id, initialState),
        ),
    ],
    // We do not include `initialState` in dependencies since it is only run
    // once and any changes after that should not affect anything
    [store, id, guard],
  );

  // We have to track state-updates with useState due to how React is handling
  // transitions with useSyncExternalStore.
  //
  // useSyncExternalStore forces react to perform a synchronous render, which
  // will trigger Suspense-boundaries and their fallbacks since it does not
  // have the data available to preserve the temporary component(s). It kind of
  // is in the name, with sync.
  //
  // In essence, React does not have the ability to track external data and
  // previous versions of it, so we have to manually insert it into useState for
  // React to keep track of it during transitions.
  // This also introduces some tricky updates and handling of subscriptions and
  // server snapshots.
  //
  // https://react.dev/reference/react/useSyncExternalStore#caveats
  // https://react.dev/reference/react/useTransition#starttransition-caveats
  // https://react.dev/reference/react/startTransition#caveats
  let [entry, setEntry] = useState(
    // This can only happen during hydration, or initial render of the component, it never happens during updates
    getInitialEntry,
  );
  const componentId = useRef(id);

  if (componentId.current !== id) {
    // We are swapping id, so we have to immediately create the new entry to
    // avoid tearing (new id rendered with old data in the same render).
    componentId.current = id;

    // Initialize the new data already in its new slot in the Store, useEffect will
    // register the listener and potentially destroy the old value (depending on the
    // subscription strategy).
    entry = getEntry();

    if (entry.kind === "suspended") {
      // Listen for the actual update, and resynchronize our local state before
      // React gets to render the component again.
      entry.value.finally(() => {
        // Ensure we do not get old updates, in case id has increased while we
        // were away.
        if (id === componentId.current) {
          setEntry(entry);
        } else {
          console.warn(
            new Error(
              `Discarding suspended update from old id '${id}', component replaced by '${componentId.current}'.`,
            ),
          );
        }
      });
    }

    // TODO: Are we sure that this will happen properly? And that the sync
    // listener here which calls setState in render will not make react fallback?
    //
    // This works as long as we do not, but we need tests somehow to verify this
  }

  // This subscribe/unsubscribe works fine no matter where it is in the
  // component or when it is run, since react will try to re-render the
  // component as soon as any promise is resolved. So we do not need to
  // subscribe to asynchronous updates, just updates.
  //
  // Only concern we have is if any update happens in between us rendering, and
  // subscription being registered. Maybe we need to register inline somehow?
  // TODO: Tearing-tests
  useEffect(() => {
    console.log("Subscribing");
    // TODO: Can we have a mismatch here? As in tearing? Check the test-suite of useSyncExternalStore

    const unsub = subscribeStrategy(
      store,
      id,
      guard,
      listen(store, id, () => {
        if (id === componentId.current) {
          console.log("Updating state");
          setEntry(getEntry());
        } else {
          console.warn(
            new Error(
              `Discarding subscribed update from old id '${id}', component replaced by '${componentId.current}'.`,
            ),
          );
        }
      }),
    );

    return () => {
      console.log("Unsubscribing to", id);

      unsub();
    };
  }, [store, id, guard]);

  const value = unwrapEntry(entry);

  // DEBUG
  // We have to debug after the unwrap, since if it is a promise in progress we
  // have a mismatch between the promise in the Store, and the old value in the
  // state, we have to wait until the promise resolves before we can verify
  // that they are the same
  if (componentId.current === id) {
    const currentEntry = getEntry();

    if (entry !== currentEntry) {
      // TODO: This happens with all useTransition for the same state
      //
      // GUESS: React first re-renders the component with all-old data
      //        then starts a new incremental render in the background with
      //        the new data which then replaces once it succeeds (ie.
      //        suspended promise resolves in this case).
      //
      // TODO: Do we have to do any kind of sync-shenanigans like we do
      // when swapping id?
      console.error(
        "Mismatch with ",
        JSON.stringify({
          id,
          entry,
          currentEntry,
        }),
      );
    }
  }

  /*
  // Make sure we always pass the same functions, both to consumers to avoid
  // re-redering whole trees, but also to useSyncExternalStore() since it will
  // trigger extra logic and maybe re-render
  const [getSnapshot, getServerSnapshot, update, subscribe] = useMemo(
    () => [
      () => initState(store, id, initialState),
      // We have to swap to restore when we have a DOM and can hydrate, on the
      // server we have to always use initState since we do not have snapshots.
      canUseDOM()
        ? () =>
            restoreEntryFromSnapshot(store, id, () =>
              initState(store, id, initialState),
            ) as Entry<T>
        : () => initState(store, id, initialState),
      // TODO: Allow more thorough integration so the component can immediately suspend
      (update: Update<T>) => updateState(store, id, update),
      (callback: () => void) => subscribeStrategy(store, id, guard, callback),
    ],
    [store, id, guard],
  );

  const value = unwrapEntry(
    usePseudoSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
  );

  // Unwrap at end once we have initialized all hooks
  /*console.log("useSyncExternalStore");
  const value = unwrapEntry(
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
  );*/

  return [value, update];
}

/**
 * Guard preventing multiple destructors from running based on object identity
 * as well as the stored id.
 *
 * @internal
 */
interface Guard {
  id: string;
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
  const cid = useRef<Record<never, never>>();

  // TODO: useEffect only runs on client, how do we check meta-info
  // on server-render?

  // When component is suspended during initialization, all hooks are
  // discarded which means we cannot do tracking inline.
  // This is never run when we suspend, so we do not have the issue
  // by using useEffect.
  useEffect(() => {
    if (!cid.current) {
      // Unique ID when we use strict equality
      cid.current = {};
    }

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
 * Initialize a state if not already initialized.
 *
 * @internal
 */
function initState<T>(store: Store, id: string, init: Init<T>): Entry<T> {
  let entry = getEntry(store, id) as Entry<T> | undefined;

  if (!entry) {
    try {
      entry = createEntry(
        typeof init === "function" ? (init as InitFn<T>)() : init,
      );
    } catch (e: unknown) {
      // If the init fails, save it and propagate it as an error into the
      // component, we are now in an error state:
      entry = { kind: "error", value: e };
    }

    setEntry(store, id, entry);
  }

  return entry;
}

/**
 * Attempt to update an existing state entry.
 *
 * @internal
 */
function updateState<T>(store: Store, id: string, update: Update<T>): void {
  let entry = getEntry(store, id) as Entry<T> | undefined;

  if (!entry || entry.kind !== "value") {
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
}

/**
 * @internal
 */
function subscribePrivate(
  store: Store,
  id: string,
  guard: MutableRefObject<Guard | undefined>,
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
      if (
        guard.current === nonce ||
        (guard.current && guard.current.id !== id)
      ) {
        // TODO: Shared? and not just persistent? Ie. we drop this if we are
        // the last listener to it
        dropEntry(store, id);
      }
    }, 0);
  };
}

function subscribeShared(
  store: Store,
  id: string,
  _guard: MutableRefObject<Guard | undefined>,
  unsubscribe: Unregister,
): Unregister {
  return (): void => {
    unsubscribe();

    setTimeout(() => {
      if (listenerCount(store, id) === 0) {
        dropEntry(store, id);
      }
    }, 0);
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

/**
 * @internal
 */
export function canUseDOM(): boolean {
  return Boolean(
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
    typeof window !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- null
      window.document &&
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Presence check
      window.document.createElement,
  );
}
