import {
  ComponentType,
  Fragment,
  ReactNode,
  StrictMode,
  Suspense,
  createElement,
} from "react";
// import { renderToPipeableStream } from "react-dom/server";
import { render, act } from "@testing-library/react";

import { Provider, createStore, fromSnapshot, useChamp } from "./index";
import { getEntry, getSnapshot } from "./store";

interface Ref<T> {
  // We skip undefined here, even though it can be, since it is annoying for test
  current: T;
  all: Array<T>;
}

interface RenderHookResult<P extends any[], T> {
  container: HTMLElement;
  result: Ref<T>;
  error: Ref<Error>;
  rerender: (...args: P) => void;
  unmount: () => void;
}

const TEST_COMPONENT_HTML = /^<p( style="")?>TestComponent<\/p>$/;
const TEST_COMPONENT_ERROR_HTML = /^<p( style="")?>TestComponent.Error<\/p>$/;
const SUSPENDED_TEST_COMPONENT_HTML =
  /^(<p style="display: none;">TestComponent<\/p>)?<div>Suspended<\/div>$/;
const oldConsoleError = console.error;

function Suspended(): JSX.Element {
  return <div>Suspended</div>;
}

function Wrapper({ children }: { children?: ReactNode }): JSX.Element {
  return (
    <Suspense fallback={<Suspended />}>
      <Provider store={store}>{children}</Provider>
    </Suspense>
  );
}

function renderHook<P extends any[], T>(
  renderCallback: (...args: P) => T,
  options: { wrapper?: ComponentType } = {},
  ...args: P
): RenderHookResult<P, T> {
  const { wrapper: Wrapper = Fragment } = options;
  let error: any = { current: undefined, all: [] };
  let result: any = { current: undefined, all: [] };

  function TestComponent({ args }: { args: any }) {
    // We have to catch errors here, otherwise React wants to render our component
    // twice to make sure the error is "permanent", and react will output a ton of
    // duplicate errors on console.error, along with "helpful" dev-information
    try {
      error.current = undefined;

      const pendingResult = renderCallback(...args);

      result.current = pendingResult;
      result.all.push(pendingResult);

      return <p>TestComponent</p>;
    } catch (hookError: any) {
      result.current = undefined;

      if (!(hookError instanceof Error)) {
        // Suspense-support, throwing thenables, rethrow to let react handle that
        throw hookError;
      }

      error.current = hookError;
      error.all.push(hookError);

      return <p>TestComponent.Error</p>;
    }
  }

  const {
    rerender: baseRerender,
    container,
    unmount: baseUnmount,
  } = render(
    <Wrapper>
      <TestComponent args={args} />
    </Wrapper>
  );

  function rerender(...args: P) {
    baseRerender(
      <Wrapper>
        <TestComponent args={args} />
      </Wrapper>
    );

    jest.runAllTimers();
  }

  function unmount(): void {
    baseUnmount();

    jest.runAllTimers();
  }

  // We have to trigger timers since we clean up late to allow for
  // <React.StrictMode/> and Hot-Module-Reloading
  jest.runAllTimers();

  return { container, result, rerender, error, unmount };
}

let store = createStore();

jest.useFakeTimers();
// TODO: How to duplicate and run the test with <React.StrictMode/>?

beforeEach(() => {
  store = createStore();
});

afterEach(() => {
  console.error = oldConsoleError;
});

describe("useChamp()", () => {
  it("throws when no <Provider/> wraps it", () => {
    const { error, result } = renderHook(useChamp, {}, "test", 123);

    expect(error.all).toHaveLength(1);
    expect(result.all).toHaveLength(0);
    expect(error.current).toEqual(
      new Error("useChamp() must be inside a <Provider/>.")
    );
    expect(getEntry(store, "test")).toEqual(undefined);
  });

  it("throws errors", () => {
    const rejection = new Error("throws error test");
    const { error, result } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "throw-test",
      () => {
        throw rejection;
      }
    );

    expect(error.all).toHaveLength(1);
    expect(result.all).toHaveLength(0);
    expect(error.current).toBe(rejection);
    expect(getEntry(store, "throw-test")).toEqual({
      kind: "error",
      value: rejection,
    });
  });

  it("throws async errors", async () => {
    // This does not throw when expected since we need to have useEffect
    let rejectWaiting: (error: Error) => void;
    const waiting: Promise<string> = new Promise((_, reject) => {
      rejectWaiting = reject;
    });
    const rejection = new Error("throws async error test");
    const { error, result } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "async-throw-test",
      () => waiting
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(0);

    await act(() => rejectWaiting(rejection));

    expect(error.all).toHaveLength(1);
    expect(result.all).toHaveLength(0);
    expect(error.current).toBe(rejection);
    expect(getEntry(store, "async-throw-test")).toEqual({
      kind: "error",
      value: rejection,
    });
  });

  it("returns the init argument as the first element", async () => {
    const testObject1 = { test: "test-object-1" };
    const testObject2 = { test: "test-object-2" };
    const { error, result, rerender } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test",
      testObject1
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject1);
    expect(getEntry(store, "test")).toEqual({
      kind: "value",
      value: testObject1,
    });

    await rerender("test", testObject2);

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(result.current[0]).toBe(testObject1);
    expect(getEntry(store, "test")).toEqual({
      kind: "value",
      value: testObject1,
    });

    await rerender("test", testObject2);

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(3);
    expect(result.current[0]).toBe(testObject1);
    expect(getEntry(store, "test")).toEqual({
      kind: "value",
      value: testObject1,
    });
  });

  it("returns a different property if rendered using a different id", async () => {
    const testObject = { test: "test-object-1" };
    const testObject2 = { test: "test-object-2" };
    const { error, result, rerender } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test",
      testObject
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject);
    expect(getEntry(store, "test")).toEqual({
      kind: "value",
      value: testObject,
    });
    expect(getEntry(store, "test2")).toEqual(undefined);

    await rerender("test2", testObject2);

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(error.all).toHaveLength(0);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject2);
    expect(getEntry(store, "test2")).toEqual({
      kind: "value",
      value: testObject2,
    });
    expect(getEntry(store, "test")).toEqual(undefined);

    await rerender("test", testObject2);

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(3);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject2);
    expect(getEntry(store, "test")).toEqual({
      kind: "value",
      value: testObject2,
    });
    expect(getEntry(store, "test2")).toEqual(undefined);
  });

  it("calls init callback exactly once", () => {
    const newObj = { name: "new-obj" };
    const init = jest.fn(() => newObj);

    const { container, error, result } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test-init",
      init
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(newObj);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(init.mock.calls).toHaveLength(1);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-init")).toEqual({
      kind: "value",
      value: newObj,
    });
  });

  it("throws an error if the id is already used by a non-persistent state", async () => {
    const consoleError = jest.fn();
    // Silence errors
    console.error = consoleError;

    const MyComponent = (): JSX.Element => {
      const [value] = useChamp("the-duplicate-id", "foo");

      return <p>{value}</p>;
    };
    const MyDuplicateComponent = (): JSX.Element => {
      const [value] = useChamp("the-duplicate-id", "bar");

      return <p>{value}</p>;
    };

    const duplicateStateError = new Error(
      "State 'the-duplicate-id' is already mounted in another component."
    );

    expect(() =>
      render(
        <Provider store={store}>
          <div>
            <MyComponent />
            <MyDuplicateComponent />
          </div>
        </Provider>
      )
    ).toThrow(duplicateStateError);

    expect(consoleError.mock.calls).toHaveLength(2);
    expect(consoleError.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        detail: duplicateStateError,
        type: "unhandled exception",
      })
    );
  });

  it("throws an error if the id is already used by a non-persistent state, async", async () => {
    const consoleError = jest.fn();
    // Silence errors
    console.error = consoleError;

    let caughtError;
    let resolve: (str: string) => void;
    const theValue = new Promise<string>((r) => (resolve = r));
    const duplicateStateError = new Error(
      "State 'the-duplicate-id' is already mounted in another component."
    );

    const MyComponent = (): JSX.Element => {
      const [value] = useChamp("the-duplicate-id", () => theValue);

      return <p>{value}</p>;
    };
    const MyDuplicateComponent = (): JSX.Element => {
      const [value] = useChamp("the-duplicate-id", "bar");

      return <p>{value}</p>;
    };

    const { container } = render(
      <Provider store={store}>
        <div>
          <MyComponent />
          <MyDuplicateComponent />
        </div>
      </Provider>
    );

    expect(consoleError.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toEqual("");

    try {
      await act(async () => {
        resolve("foo");

        await theValue;
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toEqual(duplicateStateError);
    expect(consoleError.mock.calls).toHaveLength(2);
    expect(consoleError.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        detail: duplicateStateError,
        type: "unhandled exception",
      })
    );
    expect(container.innerHTML).toEqual("");
  });
});

describe("useChamp() when hydrating", () => {
  it("throws if no snapshot is present, then React falls back to client-side init", () => {
    const consoleError = jest.fn();
    // Silence and record errors
    console.error = consoleError;

    const noSnapshotError = new Error("Server-snapshot is missing.");
    const container = document.createElement("div");
    const init = jest.fn(() => ({ text: "test-new" }));
    const MyComponent = (): JSX.Element => {
      const [{ text }] = useChamp("test-unsuspend", init);

      return <p>{text}</p>;
    };

    const el = document.createElement("p");

    el.innerHTML = "test-unsuspended";

    container.appendChild(el);

    expect(getEntry(store, "test-unsuspend")).toBeUndefined();
    expect(getSnapshot(store, "test-unsuspend")).toBeUndefined();

    render(
      <Provider store={store}>
        <MyComponent />
      </Provider>,
      { hydrate: true, container }
    );
    jest.runAllTimers();

    expect(consoleError.mock.calls).toHaveLength(4);
    expect(consoleError.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        detail: noSnapshotError,
        type: "unhandled exception",
      })
    );
    expect(container.innerHTML).toEqual("<p>test-new</p>");
    expect(init.mock.calls).toHaveLength(1);
    expect(getEntry(store, "test-unsuspend")).toEqual({
      kind: "value",
      value: { text: "test-new" },
    });
    expect(getSnapshot(store, "test-unsuspend")).toBeUndefined();
  });

  it("throws if no snapshot is present for the given id, then React falls back to client-side init", () => {
    const consoleError = jest.fn();
    // Silence and record errors
    console.error = consoleError;

    // Just an empty snapshot
    store = fromSnapshot(new Map());

    const noSnapshotError = new Error(
      "Server-snapshot is missing 'test-unsuspend'."
    );
    const container = document.createElement("div");
    const init = jest.fn(() => ({ text: "test-new" }));
    const MyComponent = (): JSX.Element => {
      const [{ text }] = useChamp("test-unsuspend", init);

      return <p>{text}</p>;
    };

    const el = document.createElement("p");

    el.innerHTML = "test-unsuspended";

    container.appendChild(el);

    expect(getEntry(store, "test-unsuspend")).toBeUndefined();
    expect(getSnapshot(store, "test-unsuspend")).toBeUndefined();

    render(
      <Provider store={store}>
        <MyComponent />
      </Provider>,
      { hydrate: true, container }
    );
    jest.runAllTimers();

    expect(consoleError.mock.calls).toHaveLength(4);
    expect(consoleError.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        detail: noSnapshotError,
        type: "unhandled exception",
      })
    );
    expect(container.innerHTML).toEqual("<p>test-new</p>");
    expect(init.mock.calls).toHaveLength(1);
    expect(getEntry(store, "test-unsuspend")).toEqual({
      kind: "value",
      value: { text: "test-new" },
    });
    expect(getSnapshot(store, "test-unsuspend")).toBeUndefined();
  });

  it("value is used by hook", () => {
    const unsuspendedObj = { text: "test-unsuspended" };
    const snapshot = new Map();
    const container = document.createElement("div");
    const init = jest.fn(() => ({ text: "test-new" }));
    const MyComponent = (): JSX.Element => {
      const [{ text }] = useChamp("test-unsuspend", init);

      return <p>{text}</p>;
    };

    const el = document.createElement("p");

    el.innerHTML = "test-unsuspended";

    container.appendChild(el);

    snapshot.set("test-unsuspend", { kind: "value", value: unsuspendedObj });

    store = fromSnapshot(snapshot);

    expect(getEntry(store, "test-unsuspend")).toBeUndefined();
    expect(getSnapshot(store, "test-unsuspend")).toEqual({
      kind: "value",
      value: unsuspendedObj,
    });

    const { unmount } = render(
      <Provider store={store}>
        <MyComponent />
      </Provider>,
      { hydrate: true, container }
    );
    jest.runAllTimers();

    expect(container.innerHTML).toEqual("<p>test-unsuspended</p>");
    expect(init).not.toHaveBeenCalled();
    expect(getEntry(store, "test-unsuspend")).toEqual({
      kind: "value",
      value: unsuspendedObj,
    });
    expect(getSnapshot(store, "test-unsuspend")).toEqual({
      kind: "value",
      value: unsuspendedObj,
    });

    unmount();
    jest.runAllTimers();

    expect(init.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toBe("");
    expect(getEntry(store, "test-unsuspend")).toBeUndefined();
    expect(getSnapshot(store, "test-unsuspend")).toBeUndefined();
  });

  it("value is used by hook, StrictMode", () => {
    const unsuspendedObj = { text: "test-unsuspended" };
    const snapshot = new Map();
    const container = document.createElement("div");
    const init = jest.fn(() => ({ text: "test-new" }));
    const MyComponent = (): JSX.Element => {
      const [{ text }] = useChamp("test-unsuspend", init);

      return <p>{text}</p>;
    };

    const el = document.createElement("p");

    el.innerHTML = "test-unsuspended";

    container.appendChild(el);

    snapshot.set("test-unsuspend", { kind: "value", value: unsuspendedObj });

    store = fromSnapshot(snapshot);

    expect(getEntry(store, "test-unsuspend")).toBeUndefined();
    expect(getSnapshot(store, "test-unsuspend")).toEqual({
      kind: "value",
      value: unsuspendedObj,
    });

    const { unmount } = render(
      <StrictMode>
        <Provider store={store}>
          <MyComponent />
        </Provider>
      </StrictMode>,
      { hydrate: true, container }
    );
    jest.runAllTimers();

    expect(container.innerHTML).toEqual("<p>test-unsuspended</p>");
    expect(init).not.toHaveBeenCalled();
    expect(getEntry(store, "test-unsuspend")).toEqual({
      kind: "value",
      value: unsuspendedObj,
    });
    expect(getSnapshot(store, "test-unsuspend")).toEqual({
      kind: "value",
      value: unsuspendedObj,
    });

    unmount();
    jest.runAllTimers();

    expect(init.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toBe("");
    expect(getEntry(store, "test-unsuspend")).toBeUndefined();
    expect(getSnapshot(store, "test-unsuspend")).toBeUndefined();
  });
});

describe("useChamp().update", () => {
  it("triggers re-render with updated values", async () => {
    const { container, error, result, unmount } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test",
      1
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(1);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test")).toEqual({
      kind: "value",
      value: 1,
    });

    const [, update] = result.current;

    await act(() => update(2));

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(result.current[0]).toBe(2);
    expect(result.current[1]).toBe(update);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test")).toEqual({
      kind: "value",
      value: 2,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(result.current[0]).toBe(2);
    expect(container.innerHTML).toBe("");
    expect(getEntry(store, "test")).toBeUndefined();
  });

  it("triggers re-render with async-updated values", async () => {
    let resolveWaiting: (obj: { name: string }) => void;
    const waiting = new Promise((resolve, _) => {
      resolveWaiting = resolve;
    });
    const dataObj = { name: "data-obj" };
    const newDataObj = { name: "new-data-obj" };
    const { container, error, result, unmount } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test-update-async",
      dataObj
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(dataObj);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async")).toEqual({
      kind: "value",
      value: dataObj,
    });

    const [, update] = result.current;

    await act(() => update(() => waiting));

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toBe(undefined);
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async")).toEqual({
      kind: "suspended",
      value: waiting,
    });

    // We have to wait for the promise to complete
    await act(async () => {
      resolveWaiting(newDataObj);

      await waiting;
    });

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(result.current[0]).toBe(newDataObj);
    expect(result.current[1]).toBe(update);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async")).toEqual({
      kind: "value",
      value: newDataObj,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(container.innerHTML).toBe("");
    expect(getEntry(store, "test-update-async")).toBeUndefined();
  });

  it("discards async-updated values from unmounted components", async () => {
    const consoleError = jest.fn();

    console.error = consoleError;

    let resolveWaiting: (obj: { name: string }) => void;
    const waiting = new Promise((resolve, _) => {
      resolveWaiting = resolve;
    });
    const dataObj = { name: "data-obj" };
    const newDataObj = { name: "new-data-obj" };
    const { container, error, result, unmount } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test-update-async-unmount",
      dataObj
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(dataObj);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-unmount")).toEqual({
      kind: "value",
      value: dataObj,
    });

    const [, update] = result.current;

    await act(() => update(() => waiting));

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(result.current).toBe(undefined);
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-unmount")).toEqual({
      kind: "suspended",
      value: waiting,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toBe("");
    expect(getEntry(store, "test-update-async-unmount")).toBeUndefined();

    // We have to wait for the promise to complete
    await act(async () => {
      resolveWaiting(newDataObj);

      await waiting;
    });

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledWith(
      new Error(
        "Asynchronous state update of 'test-update-async-unmount' completed after unmount."
      )
    );
    expect(container.innerHTML).toEqual("");
    expect(getEntry(store, "test-update-async-unmount")).toBeUndefined();
  });

  it("discards async-updated values from old components", async () => {
    const consoleError = jest.fn();

    console.error = consoleError;

    let resolveWaiting: (obj: { name: string }) => void;
    const waiting = new Promise((resolve, _) => {
      resolveWaiting = resolve;
    });
    const dataObj = { name: "data-obj" };
    const newDataObj = { name: "new-data-obj" };
    let { container, error, result, unmount } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test-update-async-unmount",
      dataObj
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(dataObj);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-unmount")).toEqual({
      kind: "value",
      value: dataObj,
    });

    const [, update] = result.current;

    await act(() => update(() => waiting));

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(result.current).toBe(undefined);
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-unmount")).toEqual({
      kind: "suspended",
      value: waiting,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toBe("");
    expect(getEntry(store, "test-update-async-unmount")).toBeUndefined();

    // Render again, with same id
    ({ container, error, result, unmount } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test-update-async-unmount",
      dataObj
    ));

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toEqual([]);
    expect(container.innerHTML).toEqual("<p>TestComponent</p>");
    expect(getEntry(store, "test-update-async-unmount")).toEqual({
      kind: "value",
      value: dataObj,
    });

    // We have to wait for the promise to complete
    await act(async () => {
      resolveWaiting(newDataObj);

      await waiting;
    });

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledWith(
      new Error(
        "Asynchronous state update of 'test-update-async-unmount' completed after being replaced."
      )
    );
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-unmount")).toEqual({
      kind: "value",
      value: dataObj,
    });
  });

  it("discards async-updated values from old components even when suspended", async () => {
    const consoleError = jest.fn();

    console.error = consoleError;

    let resolveWaiting: (obj: { name: string }) => void;
    let resolveWaiting2: (obj: { name: string }) => void;
    const waiting = new Promise((resolve, _) => {
      resolveWaiting = resolve;
    });
    const waiting2 = new Promise((resolve, _) => {
      resolveWaiting2 = resolve;
    });
    const dataObj = { name: "data-obj" };
    const newDataObj = { name: "new-data-obj" };
    let { container, error, result, unmount } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test-update-async-unmount",
      dataObj
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(dataObj);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-unmount")).toEqual({
      kind: "value",
      value: dataObj,
    });

    const [, update] = result.current;

    await act(() => update(() => waiting));

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(result.current).toBe(undefined);
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-unmount")).toEqual({
      kind: "suspended",
      value: waiting,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toBe("");
    expect(getEntry(store, "test-update-async-unmount")).toBeUndefined();

    // Render again, with same id
    let result2;
    ({
      container,
      error,
      result: result2,
      unmount,
    } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test-update-async-unmount",
      () => waiting2
    ));

    expect(error.all).toHaveLength(0);
    expect(result2.all).toHaveLength(0);
    expect(consoleError.mock.calls).toEqual([]);
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-unmount")).toEqual({
      kind: "suspended",
      value: waiting2,
    });

    // We have to wait for the promise to complete
    await act(async () => {
      resolveWaiting(dataObj);

      await waiting;
    });

    expect(error.all).toHaveLength(0);
    expect(result2.all).toHaveLength(0);
    expect(consoleError).toHaveBeenCalledWith(
      new Error(
        "Asynchronous state update of 'test-update-async-unmount' completed after being replaced."
      )
    );
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-unmount")).toEqual({
      kind: "suspended",
      value: waiting2,
    });

    // We have to wait for the promise to complete
    await act(async () => {
      resolveWaiting2(newDataObj);

      await waiting2;
    });

    expect(error.all).toHaveLength(0);
    expect(result2.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(1);
    expect(result2.current).toHaveLength(2);
    expect(result2.current[0]).toBe(newDataObj);
    expect(result2.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-unmount")).toEqual({
      kind: "value",
      value: newDataObj,
    });
  });

  it("discards async-updated values from old id", async () => {
    const consoleError = jest.fn();

    console.error = consoleError;

    let resolveWaiting: (obj: { name: string }) => void;
    const waiting = new Promise((resolve, _) => {
      resolveWaiting = resolve;
    });
    const dataObj = { name: "data-obj" };
    const newDataObj = { name: "new-data-obj" };
    let { container, error, result, rerender } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test-update-async-old",
      dataObj
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(dataObj);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-old")).toEqual({
      kind: "value",
      value: dataObj,
    });

    const [, update] = result.current;

    await act(() => update(() => waiting));

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(result.current).toBe(undefined);
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-old")).toEqual({
      kind: "suspended",
      value: waiting,
    });

    rerender("test-update-async-new", dataObj);

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(consoleError.mock.calls).toEqual([]);
    expect(result.current[0]).toBe(dataObj);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-old")).toBeUndefined();
    expect(getEntry(store, "test-update-async-new")).toEqual({
      kind: "value",
      value: dataObj,
    });

    // We have to wait for the promise to complete
    await act(async () => {
      resolveWaiting(newDataObj);

      await waiting;
    });

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(consoleError).toHaveBeenCalledWith(
      new Error(
        "Asynchronous state update of 'test-update-async-old' completed after unmount."
      )
    );
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async-old")).toBeUndefined();
    expect(getEntry(store, "test-update-async-new")).toEqual({
      kind: "value",
      value: dataObj,
    });
  });

  it("throws errors", async () => {
    const testError = new Error("Error from update test callback");
    const { container, error, result } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "update-throw-test",
      "init"
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe("init");
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "update-throw-test")).toEqual({
      kind: "value",
      value: "init",
    });

    const [, update] = result.current;

    await act(() =>
      update(() => {
        throw testError;
      })
    );

    expect(error.all).toHaveLength(1);
    expect(result.all).toHaveLength(1);
    expect(error.current).toBe(testError);
    expect(result.current).toBeUndefined();
    expect(container.innerHTML).toMatch(TEST_COMPONENT_ERROR_HTML);
    expect(getEntry(store, "update-throw-test")).toEqual({
      kind: "error",
      value: testError,
    });
  });

  it("throws async errors", async () => {
    // This does not throw when expected since we need to have useEffect
    let rejectWaiting: (error: Error) => void;
    const waiting: Promise<string> = new Promise((_, reject) => {
      rejectWaiting = reject;
    });
    const rejection = new Error("throws async error test");
    const { container, error, result } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "update-async-throw-test",
      "init"
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe("init");
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "update-async-throw-test")).toEqual({
      kind: "value",
      value: "init",
    });

    const [, update] = result.current;

    await act(() => update(() => waiting));

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toBeUndefined();
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getEntry(store, "update-async-throw-test")).toEqual({
      kind: "suspended",
      value: waiting,
    });

    // We have to wait for the promise to complete
    await act(async () => {
      rejectWaiting(rejection);

      // Catch since it is an expected error
      await waiting.catch(() => {});
    });

    expect(error.all).toHaveLength(1);
    expect(result.all).toHaveLength(1);
    expect(error.current).toBe(rejection);
    expect(result.current).toBeUndefined();
    expect(container.innerHTML).toMatch(TEST_COMPONENT_ERROR_HTML);
    expect(getEntry(store, "update-async-throw-test")).toEqual({
      kind: "error",
      value: rejection,
    });
  });

  it("fails with a predictable exception after error", async () => {
    let caughtError;
    const { container, error, result } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test",
      1
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(1);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test")).toEqual({
      kind: "value",
      value: 1,
    });

    const [, update] = result.current;

    await act(() =>
      update(() => {
        throw new Error("this test error");
      })
    );

    expect(error.all).toHaveLength(1);
    expect(result.all).toHaveLength(1);
    expect(error.all).toEqual([new Error("this test error")]);
    expect(result.current).toBeUndefined();
    expect(container.innerHTML).toEqual("<p>TestComponent.Error</p>");
    expect(getEntry(store, "test")).toEqual({
      kind: "error",
      value: new Error("this test error"),
    });

    try {
      await act(() => update(2));
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toEqual(
      new Error("State update of 'test' requires a value (was error).")
    );
    expect(error.all).toHaveLength(1);
    expect(result.all).toHaveLength(1);
    expect(result.current).toBeUndefined();
    expect(container.innerHTML).toBe("<p>TestComponent.Error</p>");
    expect(getEntry(store, "test")).toEqual({
      kind: "error",
      value: new Error("this test error"),
    });
  });

  it("fails with a predictable exception after unmount", async () => {
    let caughtError;
    const { container, error, result, unmount } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test",
      1
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(1);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test")).toEqual({
      kind: "value",
      value: 1,
    });

    const [, update] = result.current;

    unmount();

    try {
      await act(() => update(2));
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toEqual(
      new Error("State update of 'test' requires a value (was empty).")
    );
    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current[0]).toBe(1);
    expect(container.innerHTML).toBe("");
    expect(getEntry(store, "test")).toBeUndefined();
  });

  it("fails with a predictable exception if called during an asynchronous update", async () => {
    let caughtError;
    let resolveWaiting: (obj: { name: string }) => void;
    const waiting = new Promise((resolve, _) => {
      resolveWaiting = resolve;
    });
    const dataObj = { name: "data-obj" };
    const newDataObj = { name: "new-data-obj" };
    const { container, error, result, unmount } = renderHook(
      useChamp,
      { wrapper: Wrapper },
      "test-update-async",
      dataObj
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(dataObj);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async")).toEqual({
      kind: "value",
      value: dataObj,
    });

    const [, update] = result.current;

    await act(() => update(() => waiting));

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toBe(undefined);
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async")).toEqual({
      kind: "suspended",
      value: waiting,
    });

    try {
      await act(() => update({ name: "should-never-show" }));
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toEqual(
      new Error(
        "State update of 'test-update-async' requires a value (was suspended)."
      )
    );
    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toBe(undefined);
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async")).toEqual({
      kind: "suspended",
      value: waiting,
    });

    // We have to wait for the promise to complete
    await act(async () => {
      resolveWaiting(newDataObj);

      await waiting;
    });

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(result.current[0]).toBe(newDataObj);
    expect(result.current[1]).toBe(update);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getEntry(store, "test-update-async")).toEqual({
      kind: "value",
      value: newDataObj,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(container.innerHTML).toBe("");
    expect(getEntry(store, "test-update-async")).toBeUndefined();
  });
});

describe("useChamp(persistent)", () => {
  it("triggers error if not all uses of the same id are persistent", async () => {
    const consoleError = jest.fn();
    // Silence errors
    console.error = consoleError;

    const sharedObj = { name: "shared-obj" };
    const init = jest.fn(() => sharedObj);
    const renders: Array<string> = [];
    const MyComponent = (): JSX.Element => {
      const [data] = useChamp("test", init, { persistent: false });

      renders.push("MyComponent");

      return <p>{data.name}</p>;
    };
    const MyOtherComponent = (): JSX.Element => {
      const [data] = useChamp("test", init, { persistent: true });

      renders.push("MyOtherComponent");

      return <p>{data.name}</p>;
    };

    const notPersistentStateError = new Error(
      "State 'test' is not persistent."
    );

    expect(() =>
      render(
        <Provider store={store}>
          <MyComponent />
          <MyOtherComponent />
        </Provider>
      )
    ).toThrow(notPersistentStateError);
    jest.runAllTimers();

    expect(consoleError.mock.calls).toHaveLength(2);
    expect(consoleError.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        detail: notPersistentStateError,
        type: "unhandled exception",
      })
    );
    expect(init.mock.calls).toHaveLength(1);
    // We still expect both to have rendered, we check things in an effect
    // which is triggered after render
    expect(renders).toEqual(["MyComponent", "MyOtherComponent"]);
    expect(getEntry(store, "test")).toEqual({
      kind: "value",
      value: sharedObj,
    });
  });

  it("triggers error if not all uses of the same id are persistent, reverse", async () => {
    const consoleError = jest.fn();
    // Silence errors
    console.error = consoleError;

    const sharedObj = { name: "shared-obj" };
    const init = jest.fn(() => sharedObj);
    const renders: Array<string> = [];
    const MyComponent = (): JSX.Element => {
      const [data] = useChamp("test", init, { persistent: false });

      renders.push("MyComponent");

      return <p>{data.name}</p>;
    };
    const MyOtherComponent = (): JSX.Element => {
      const [data] = useChamp("test", init, { persistent: true });

      renders.push("MyOtherComponent");

      return <p>{data.name}</p>;
    };

    const persistentStateError = new Error("State 'test' is persistent.");

    expect(() =>
      render(
        <Provider store={store}>
          <MyOtherComponent />
          <MyComponent />
        </Provider>
      )
    ).toThrow(persistentStateError);
    jest.runAllTimers();

    expect(consoleError.mock.calls).toHaveLength(2);
    expect(consoleError.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        detail: persistentStateError,
        type: "unhandled exception",
      })
    );
    expect(init.mock.calls).toHaveLength(1);
    // We still expect both to have rendered, we check things in an effect
    // which is triggered after render
    expect(renders).toEqual(["MyOtherComponent", "MyComponent"]);
    expect(getEntry(store, "test")).toEqual({
      kind: "value",
      value: sharedObj,
    });
  });

  it("shares state between multiple components", async () => {
    const sharedObj = { name: "shared-obj" };
    const init = jest.fn(() => sharedObj);
    const renders: Array<{ name: string; data: { name: string } }> = [];
    const MyComponent = (): JSX.Element => {
      const [data] = useChamp("test", init, { persistent: true });

      renders.push({ name: "MyComponent", data });

      return <p>{data.name}</p>;
    };
    const MyOtherComponent = (): JSX.Element => {
      const [data] = useChamp("test", init, { persistent: true });

      renders.push({ name: "MyOtherComponent", data });

      return <p>{data.name}</p>;
    };
    const { container } = render(
      <Provider store={store}>
        <MyComponent />
        <MyOtherComponent />
      </Provider>
    );
    jest.runAllTimers();

    expect(container.innerHTML).toEqual("<p>shared-obj</p><p>shared-obj</p>");
    expect(renders).toEqual([
      { name: "MyComponent", data: sharedObj },
      { name: "MyOtherComponent", data: sharedObj },
    ]);
    expect(init.mock.calls).toHaveLength(1);
    expect(renders[0]!.data).toBe(renders[1]!.data);
    expect(getEntry(store, "test")).toEqual({
      kind: "value",
      value: sharedObj,
    });
  });
});
