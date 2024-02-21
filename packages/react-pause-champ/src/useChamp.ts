import {
  MutableRefObject,
  useEffect,
  useCallback,
  useRef,
  useState,
} from "react";
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
import { useStore } from "./components/Provider";

/**
 * Initial value or a function creating the initial value for a stateful
 * variable in {@link useChamp}.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @see {@link Update}
 */
export type Init<T> = T | Promise<T> | InitFn<T>;
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

  return pauseChamp(store, id, subscribePrivate, initialState);
}

/**
 * Creates a typed persistent state with the given id, this state can be used
 * simultaneously in multiple components which then shares the state data and
 * respond to the same updates.
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
      useStore("use of persistent state hook"),
      PERSISTENT_PREFIX + id,
      subscribePersistent,
      initialState,
    );
}

/**
 * Creates a state which will be shared by all simultaneous consumers, contents
 * will be destroyed once all the consuming components have unmounted.
 */
export function createSharedState<T = never>(id: string): UseSharedState<T> {
  return (initialState) =>
    pauseChamp(
      useStore("use of shared state hook"),
      SHARED_PREFIX + id,
      subscribeShared,
      initialState,
    );
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

// TODO: Behaviour hooks
// TODO: Semi-internal?
/**
 * @internal
 */
export function pauseChamp<T>(
  store: Store,
  id: string,
  subscribeStrategy: SubscribeStrategy,
  initialState: Init<T>,
): [T, UpdateCallback<T>] {
  // Guard value for cleanup callback, useRef() will remain the same even in
  // <React.StrictMode/>, which means we can use this to ensure we only clean
  // up once the component really unmounts.
  const guard = useRef<Guard>();

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
  //
  // initial state callback can only be executed during hydration, or initial
  // render of the component, it never happens during updates.
  const state = useState(
    () =>
      restoreEntryFromSnapshot(store, id, () =>
        initState(store, id, initialState),
      ) as Entry<T>,
  );
  const setState = state[1];
  let entry = state[0];
  const component = useRef({ id, entry });

  // Make sure we always pass the same functions, both to consumers to avoid
  // re-redering whole trees, but also to useSyncExternalStore() since it will
  // trigger extra logic and maybe re-render
  // TODO: Allow more thorough integration so the component can immediately suspend
  const update = useCallback(
    // TODO: Verify that this setState is needed to preserve desync in the case
    // of other component/hook suspending during component mount, after update
    // is called
    (update: Update<T>) => setState(updateState(store, id, update)),
    [store, id],
  );

  // Callback to synchronize the component state with the store
  // TODO: Refactor
  const synchronize = useCallback(() => {
    // Running this multiple times will result in the same result as running it
    // once, no objects are constructed

    // Ensure we do not get old updates, in case id has changed while we
    // were away.
    if (component.current.id === id) {
      // We should really have an initialized entry here
      const newEntry = getEntry(store, id) as Entry<T> | undefined;

      if (newEntry) {
        // Do not update if our last rendered entry is already the new one,
        // React seems to sometimes still queue updates here for some reason
        if (newEntry !== component.current.entry) {
          setState(newEntry);
        }
      } else {
        console.warn(
          new Error(`Failed to synchronize state '${id}': missing entry`),
        );
      }
    } else {
      console.warn(
        new Error(
          `Discarding subscribed update from old id '${id}', component replaced by '${component.current}'.`,
        ),
      );
    }
  }, [store, id]);

  if (component.current.id !== id) {
    // We are swapping id, so we have to immediately create or retrieve the new
    // entry to avoid tearing (new id rendered with old data in the same render).
    component.current.id = id;

    // NOTE: This swaps back and forth a few times during transitions, so we
    // CANNOT drop any data here, since then we will re-initialize old state
    // while replacing the component-tree with the new state.

    // Initialize the new data already in its new slot in the Store, useEffect will
    // register the listener and potentially destroy the old value (depending on the
    // subscription strategy).
    entry = initState(store, id, initialState);

    // We are going to throw here, so make sure we update the local useState
    // before React renders us after the entry got resolved.
    //
    // This is not necessary in the case of the initial render, when the entry
    // in the useState is the promise we are waiting on, since react will
    // re-render with the internally modified entry which is then a value/error
    // entry.
    if (entry.kind === "suspended") {
      void entry.value.finally(synchronize);
    }
  }

  // Save the current entry we rendered to avoid multiple redraws
  component.current.entry = entry;

  // This subscribe/unsubscribe works fine no matter where it is in the
  // component or when it is run, since react will try to re-render the
  // component as soon as any promise is resolved. So we do not need to
  // subscribe to asynchronous updates from the store, just updates.
  //
  // Only concern we have is if any update happens in between us rendering, and
  // subscription being registered, which we catch by calling synchronize
  // before registering our listener.
  //
  // NOTE: Cleanup of the useEffect hook in a transition is executed once the
  // full transition is complete. The new state will have to have fully been
  // executed before we properly unregister the old useEffect callback.
  // It will also delay registering the new hook until the transition has
  // finished.
  //
  // Ordering in a transition with changing id and suspend:
  //
  //  1. Component(id:a) renders
  //     state: data_a
  //     store(a): data_a
  //     value: data_a
  //  2. useEffect(id:a) registers
  //  3. id: a -> b
  //  4. Component(id:a) renders again to ensure our transition is not external
  //     state: data_a
  //     store(a): data_a
  //     value: data_a
  //  5. Component(id:a -> id:b)
  //     state: data_a
  //     store(a): data_a
  //     store(b): Promise of data_b
  //     value: Promise of data_b
  //  6. React suspends on thrown promise
  //  7. Resolve on promise triggers setState(data_b)
  //     state: data_b
  //     store(a): data_a
  //     store(b): data_b
  //  8. Component(id:b -> id:a), renders YET AGAIN with old values as a sanity check?
  //     state: data_b
  //     store(a): data_a
  //     store(b): data_b
  //     value: data_a
  //  9. Component(id:a -> id:b)
  //     state: data_b
  //     store(a): data_a
  //     store(b): data_b
  //     value: data_b
  // 10. useEffect from id:a is finally unregistered
  // 11. useEffect from id:b is registered
  // 12. scheduled drop of id:a state is performed in store outside react
  //     render loop
  useEffect(() => {
    // We have to sychronize here just in case something replaced our entry
    // during render to avoid tearing:
    synchronize();

    return subscribeStrategy(store, id, guard, listen(store, id, synchronize));
    // Technically synchronize will also update on (store, id)
  }, [store, id, guard, subscribeStrategy, synchronize]);

  // NOTE: In the case of useTransition/startTransition the entry value can
  // differ from the current entry obtained using getEntry(), despite ids being
  // identical and everything.
  //
  // This is because it seems like React first re-renders the component with
  // all-old data to make sure it has complete control, and then starts an
  // incremental render in the background with the new data, which then
  // replaces the old tree once it finishes with a final flip back and forth.

  // We can now unwrap since we have initialized all hooks
  const value = unwrapEntry(entry);

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
function updateState<T>(store: Store, id: string, update: Update<T>): Entry<T> {
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

  return entry;
}

/**
 * @internal
 */
// TODO: Refactor and cleanup
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
