import { Storage, Provider, useWeird } from "./index";
import { StateKind, getData } from "./internal";
import {
  ComponentType,
  Fragment,
  ReactNode,
  StrictMode,
  Suspense,
  createElement,
} from "react";
import { render, act } from "@testing-library/react";

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
      <Provider storage={storage}>{children}</Provider>
    </Suspense>
  );
}

function StrictModeWrapper({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  return (
    <StrictMode>
      <Suspense fallback={<Suspended />}>
        <Provider storage={storage}>{children}</Provider>
      </Suspense>
    </StrictMode>
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

let storage = new Storage();

jest.useFakeTimers();
// TODO: How to duplicate and run the test with <React.StrictMode/>?

beforeEach(() => {
  storage = new Storage();
});

afterEach(() => {
  console.error = oldConsoleError;
});

describe("new Storage()", () => {
  it("creates a new empty instance", () => {
    const s = new Storage();

    expect(s._data).toEqual(new Map());
    expect(s._listeners).toEqual(new Map());
  });

  it("reuses an existing Map instance if supplied", () => {
    const theMap = new Map();

    theMap.set("test", { kind: StateKind.Value, value: "existing value" });

    const s = new Storage(theMap);

    expect(s._data).toBe(theMap);
    expect(s._listeners).toEqual(new Map());
  });

  it("copies data from a Storage instance if supplied", () => {
    const testObject = { name: "test-object" };
    const initFn = jest.fn(() => testObject);

    const entry = storage.initState("test", initFn);

    expect(entry).toEqual({ kind: StateKind.Value, value: testObject });
    expect(entry.value).toBe(testObject);
    expect(initFn.mock.calls).toHaveLength(1);

    const s = new Storage(storage);

    expect(s._data).toEqual(
      new Map([["test", { kind: StateKind.Value, value: testObject }]])
    );
    expect(s._listeners).toEqual(new Map());

    const newEntry = s.initState("test", initFn);

    expect(newEntry).toEqual({ kind: StateKind.Value, value: testObject });
    expect(newEntry.value).toBe(testObject);
    expect(initFn.mock.calls).toHaveLength(1);
  });
});

describe("useWeird()", () => {
  it("throws when no <Provider/> wraps it", () => {
    const { error, result } = renderHook(useWeird, {}, "test", 123);

    expect(error.all).toHaveLength(1);
    expect(result.all).toHaveLength(0);
    expect(error.current).toEqual(
      new Error("useWeird() must be inside a <Weird.Provider/>")
    );
    expect(getData(storage).get("test")).toEqual(undefined);
  });

  it("throws errors", () => {
    const rejection = new Error("throws error test");
    const { error, result } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "throw-test",
      () => {
        throw rejection;
      }
    );

    expect(error.all).toHaveLength(1);
    expect(result.all).toHaveLength(0);
    expect(error.current).toBe(rejection);
    expect(getData(storage).get("throw-test")).toEqual({
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
      useWeird,
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
    expect(getData(storage).get("async-throw-test")).toEqual({
      kind: "error",
      value: rejection,
    });
  });

  it("returns the init argument as the first element", async () => {
    const testObject1 = { test: "test-object-1" };
    const testObject2 = { test: "test-object-2" };
    const { error, result, rerender } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "test",
      testObject1
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject1);
    expect(getData(storage).get("test")).toEqual({
      kind: "value",
      value: testObject1,
    });

    await rerender("test", testObject2);

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(result.current[0]).toBe(testObject1);
    expect(getData(storage).get("test")).toEqual({
      kind: "value",
      value: testObject1,
    });

    await rerender("test", testObject2);

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(3);
    expect(result.current[0]).toBe(testObject1);
    expect(getData(storage).get("test")).toEqual({
      kind: "value",
      value: testObject1,
    });
  });

  it("returns a different property if rendered using a different id", async () => {
    const testObject = { test: "test-object-1" };
    const testObject2 = { test: "test-object-2" };
    const { error, result, rerender } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "test",
      testObject
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject);
    expect(getData(storage).get("test")).toEqual({
      kind: "value",
      value: testObject,
    });
    expect(getData(storage).get("test2")).toEqual(undefined);

    await rerender("test2", testObject2);

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(error.all).toHaveLength(0);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject2);
    expect(getData(storage).get("test2")).toEqual({
      kind: "value",
      value: testObject2,
    });
    expect(getData(storage).get("test")).toEqual(undefined);

    await rerender("test", testObject2);

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(3);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject2);
    expect(getData(storage).get("test")).toEqual({
      kind: "value",
      value: testObject2,
    });
    expect(getData(storage).get("test2")).toEqual(undefined);
  });

  it("calls init callback exactly once", () => {
    const newObj = { name: "new-obj" };
    const init = jest.fn(() => newObj);

    const { container, error, result } = renderHook(
      useWeird,
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
    expect(getData(storage).get("test-init")).toEqual({
      kind: "value",
      value: newObj,
    });
  });
});

describe("Storage.unsuspend()", () => {
  it("value is used by hook", () => {
    const unsuspendedObj = { name: "unsuspended-obj" };
    const newObj = { name: "new-obj" };
    const init = jest.fn(() => newObj);

    storage.unsuspend("test-unsuspend", StateKind.Value, unsuspendedObj);
    expect(getData(storage).get("test-unsuspend")).toEqual({
      kind: "value",
      value: unsuspendedObj,
    });

    const { container, result, error, unmount } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "test-unsuspend",
      init
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(unsuspendedObj);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(init.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getData(storage).get("test-unsuspend")).toEqual({
      kind: "value",
      value: unsuspendedObj,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(init.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toBe("");
    expect(getData(storage).get("test-unsuspend")).toBeUndefined();
  });

  it("value is used by hook, StrictMode", () => {
    const unsuspendedObj = { name: "unsuspended-obj" };
    const newObj = { name: "new-obj" };
    const init = jest.fn(() => newObj);

    storage.unsuspend("test-unsuspend", StateKind.Value, unsuspendedObj);
    expect(getData(storage).get("test-unsuspend")).toEqual({
      kind: "value",
      value: unsuspendedObj,
    });

    const { container, result, error, unmount } = renderHook(
      useWeird,
      { wrapper: StrictModeWrapper },
      "test-unsuspend",
      init
    );

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(result.current[0]).toBe(unsuspendedObj);
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(init.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);
    expect(getData(storage).get("test-unsuspend")).toEqual({
      kind: "value",
      value: unsuspendedObj,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(init.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toBe("");
    expect(getData(storage).get("test-unsuspend")).toBeUndefined();
  });
});

describe("useWeird().update", () => {
  it("triggers re-render with updated values", async () => {
    const { container, error, result, unmount } = renderHook(
      useWeird,
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
    expect(getData(storage).get("test")).toEqual({
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
    expect(getData(storage).get("test")).toEqual({
      kind: "value",
      value: 2,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(result.current[0]).toBe(2);
    expect(container.innerHTML).toBe("");
    expect(getData(storage).get("test")).toBeUndefined();
  });

  it("triggers re-render with async-updated values", async () => {
    let resolveWaiting: (obj: { name: string }) => void;
    const waiting = new Promise((resolve, _) => {
      resolveWaiting = resolve;
    });
    const dataObj = { name: "data-obj" };
    const newDataObj = { name: "new-data-obj" };
    const { container, error, result, unmount } = renderHook(
      useWeird,
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
    expect(getData(storage).get("test-update-async")).toEqual({
      kind: "value",
      value: dataObj,
    });

    const [, update] = result.current;

    await act(() => update(() => waiting));

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toBe(undefined);
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getData(storage).get("test-update-async")).toEqual({
      kind: "pending",
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
    expect(getData(storage).get("test-update-async")).toEqual({
      kind: "value",
      value: newDataObj,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(2);
    expect(container.innerHTML).toBe("");
    expect(getData(storage).get("test-update-async")).toBeUndefined();
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
      useWeird,
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
    expect(getData(storage).get("test-update-async-unmount")).toEqual({
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
    expect(getData(storage).get("test-update-async-unmount")).toEqual({
      kind: "pending",
      value: waiting,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toBe("");
    expect(getData(storage).get("test-update-async-unmount")).toBeUndefined();

    // We have to wait for the promise to complete
    await act(async () => {
      resolveWaiting(newDataObj);

      await waiting;
    });

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledWith(
      new Error(
        "Asynchronous state update of 'test-update-async-unmount' completed on dropped data"
      )
    );
    expect(container.innerHTML).toMatch("");
    expect(getData(storage).get("test-update-async-unmount")).toBeUndefined();
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
      useWeird,
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
    expect(getData(storage).get("test-update-async-unmount")).toEqual({
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
    expect(getData(storage).get("test-update-async-unmount")).toEqual({
      kind: "pending",
      value: waiting,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toBe("");
    expect(getData(storage).get("test-update-async-unmount")).toBeUndefined();

    // Render again, with same id
    ({ container, error, result, unmount } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "test-update-async-unmount",
      dataObj
    ));

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toEqual([]);
    expect(container.innerHTML).toMatch("");
    expect(getData(storage).get("test-update-async-unmount")).toEqual({
      kind: StateKind.Value,
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
        "Asynchronous state update of 'test-update-async-unmount' completed on resolved data"
      )
    );
    expect(container.innerHTML).toMatch("");
    expect(getData(storage).get("test-update-async-unmount")).toEqual({
      kind: StateKind.Value,
      value: dataObj,
    });
  });

  it("discards async-updated values from old components even when pending", async () => {
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
      useWeird,
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
    expect(getData(storage).get("test-update-async-unmount")).toEqual({
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
    expect(getData(storage).get("test-update-async-unmount")).toEqual({
      kind: "pending",
      value: waiting,
    });

    unmount();

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(consoleError.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toBe("");
    expect(getData(storage).get("test-update-async-unmount")).toBeUndefined();

    // Render again, with same id
    let result2;
    ({
      container,
      error,
      result: result2,
      unmount,
    } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "test-update-async-unmount",
      () => waiting2
    ));

    expect(error.all).toHaveLength(0);
    expect(result2.all).toHaveLength(0);
    expect(consoleError.mock.calls).toEqual([]);
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getData(storage).get("test-update-async-unmount")).toEqual({
      kind: StateKind.Pending,
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
        "Asynchronous state update of 'test-update-async-unmount' completed on reinitialized data"
      )
    );
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getData(storage).get("test-update-async-unmount")).toEqual({
      kind: StateKind.Pending,
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
    expect(getData(storage).get("test-update-async-unmount")).toEqual({
      kind: "value",
      value: newDataObj,
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
      useWeird,
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
    expect(getData(storage).get("update-async-throw-test")).toEqual({
      kind: "value",
      value: "init",
    });

    const [, update] = result.current;

    await act(() => update(() => waiting));

    expect(error.all).toHaveLength(0);
    expect(result.all).toHaveLength(1);
    expect(result.current).toBeUndefined();
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);
    expect(getData(storage).get("update-async-throw-test")).toEqual({
      kind: "pending",
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
    expect(getData(storage).get("update-async-throw-test")).toEqual({
      kind: "error",
      value: rejection,
    });
  });
});

// TODO: Server rendering
