import { Storage, Provider, useWeird } from "./index";
import { getData } from "./internal";
import {
  Component,
  ComponentType,
  ReactNode,
  ErrorInfo,
  Fragment,
  Suspense,
  createElement,
  useEffect,
} from "react";
import {
  render,
  // renderHook,
  act,
  //fireEvent,
  //waitForElement
} from "@testing-library/react";

interface ErrorBoundaryProps {
  children: JSX.Element[] | JSX.Element | null;
}
interface ErrorBoundaryState {
  error: Error | null;
}

let storage = new Storage();

function Wrapper({ children }: { children?: ReactNode }): JSX.Element {
  return <Provider storage={storage}>{children}</Provider>;
  // <Suspense fallback={null}>{children}</Suspense>
}

interface Ref<T> {
  // We skip undefined here, even though it can be, since it is annoying for test
  current: T;
  all: Array<T>;
}

interface RenderHookResult<P extends any[], T> {
  result: Ref<T>;
  error: Ref<Error>;
  rerender: (...args: P) => void;
  unmount: () => void;
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
      const pendingResult = renderCallback(...args);

      useEffect(() => {
        result.current = pendingResult;
        result.all.push(pendingResult);
      });
    } catch (e) {
      if (e instanceof Error) {
        error.current = e;
        error.all.push(e);
      } else {
        // Suspense-support, throwing thenables, rethrow to let react handle that
        throw e;
      }
    }

    return null;
  }

  const {
    rerender: baseRerender,
    container,
    unmount,
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
  }

  return { result, rerender, error, unmount };
}

beforeEach(() => {
  storage = new Storage();
});

describe("useWeird()", () => {
  it("throws when no <Provider/> wraps it", () => {
    const { error } = renderHook(useWeird, {}, "test", 123);

    expect(error.current).toEqual(
      new Error("useWeird() must be inside a <Weird.Provider/>")
    );
  });

  it("throws errors", () => {
    const rejection = new Error("throws error test");
    const { error } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "throw-test",
      () => {
        throw rejection;
      }
    );

    expect(error.current).toBe(rejection);
  });

  it("throws async errors", async () => {
    // This does not throw when expected since we need to have useEffect
    let rejectWaiting: (error: Error) => void;
    const waiting: Promise<string> = new Promise((_, reject) => {
      rejectWaiting = reject;
    });
    const rejection = new Error("throws async error test");
    const { result, error } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "async-throw-test",
      () => waiting
    );

    expect(result.current).toBeUndefined();

    await act(() => rejectWaiting(rejection));

    expect(result.current).toBeUndefined();
    expect(error.current).toBe(rejection);
  });

  it("returns the init argument as the first element", async () => {
    const testObject1 = { test: "test-object-1" };
    const testObject2 = { test: "test-object-2" };
    const { result, rerender } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "test",
      testObject1
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject1);
    await rerender("test", testObject2);
    expect(result.current[0]).toBe(testObject1);
    await rerender("test", testObject2);
    expect(result.current[0]).toBe(testObject1);

    expect(getData(storage).get("test")).toEqual({
      kind: "value",
      value: testObject1,
    });
  });

  it("returns a different property if rendered using a different id", async () => {
    const testObject = { test: "test-object-1" };
    const testObject2 = { test: "test-object-2" };
    const { result, rerender } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "test",
      testObject
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject);
    expect(getData(storage).get("test")).toEqual({
      kind: "value",
      value: testObject,
    });
    expect(getData(storage).get("test2")).toEqual(undefined);

    await rerender("test2", testObject2);

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject2);
    expect(getData(storage).get("test2")).toEqual({
      kind: "value",
      value: testObject2,
    });
    expect(getData(storage).get("test")).toEqual(undefined);

    await rerender("test", testObject2);

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject2);
    expect(getData(storage).get("test")).toEqual({
      kind: "value",
      value: testObject2,
    });
    expect(getData(storage).get("test2")).toEqual(undefined);
  });

  it("only calls init callback once", () => {});
});

describe("useWeird().update", () => {
  it("triggers re-render with updated values", async () => {
    const { result, rerender } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "test",
      1
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(1);
    expect(result.current[1]).toBeInstanceOf(Function);

    const [, update] = result.current;

    await act(() => update(2));

    expect(result.current[0]).toBe(2);
  });

  it.only("throws async errors", async () => {
    // This does not throw when expected since we need to have useEffect
    let rejectWaiting: (error: Error) => void;
    const waiting: Promise<string> = new Promise((_, reject) => {
      rejectWaiting = reject;
    });
    const rejection = new Error("throws async error test");
    const { result, error } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "update-async-throw-test",
      "init"
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe("init");
    expect(result.current[1]).toBeInstanceOf(Function);

    const [, update] = result.current;

    await act(() => update(() => waiting));

    console.log(result);

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe("init");
    expect(result.current[1]).toBeInstanceOf(Function);

    await act(() => rejectWaiting(rejection));

    console.log(result);

    expect(result.current).toBeUndefined();
    expect(error.current).toBe(rejection);
  });
});
