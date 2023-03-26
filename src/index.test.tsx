import { Storage, Provider, useWeird } from "./index";
import { getData } from "./internal";
import {
  //Component,
  ComponentType,
  ReactNode,
  //ErrorInfo,
  Fragment,
  Suspense,
  createElement,
  //useEffect,
} from "react";
import {
  render,
  // renderHook,
  act,
  //fireEvent,
  //waitForElement
  //waitFor,
} from "@testing-library/react";

let storage = new Storage();

function Wrapper({ children }: { children?: ReactNode }): JSX.Element {
  return (
    <Suspense fallback={null}>
      <Provider storage={storage}>{children}</Provider>
    </Suspense>
  );
}

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

// const TEST_COMPONENT_HTML = `<p>TestComponent</p>`;
const TEST_COMPONENT_HTML = /^<p( style="")?>TestComponent<\/p>$/;
const TEST_COMPONENT_ERROR_HTML = /^<p( style="")?>TestComponent.Error<\/p>$/;
const SUSPENDED_TEST_COMPONENT_HTML =
  /^<p style="display: none;">TestComponent<\/p>/;

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

    let pendingResult: T | undefined = undefined;
    let pendingError: any = undefined;

    try {
      pendingResult = renderCallback(...args);
    } catch (e: any) {
      pendingError = e;
    }

    result.current = pendingResult;
    error.current = pendingError;

    result.all.push(pendingResult);
    error.all.push(pendingError);

    if (pendingError && !(pendingError instanceof Error)) {
      // Suspense-support, throwing thenables, rethrow to let react handle that
      throw pendingError;
    }

    return pendingError ? <p>TestComponent.Error</p> : <p>TestComponent</p>;
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

  return { container, result, rerender, error, unmount };
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

  it("calls init callback exactly once", () => {});
});

describe("useWeird().update", () => {
  it("triggers re-render with updated values", async () => {
    const { result } = renderHook(useWeird, { wrapper: Wrapper }, "test", 1);

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(1);
    expect(result.current[1]).toBeInstanceOf(Function);

    const [, update] = result.current;

    await act(() => update(2));

    expect(result.current[0]).toBe(2);
  });

  it("throws async errors", async () => {
    // This does not throw when expected since we need to have useEffect
    let rejectWaiting: (error: Error) => void;
    const waiting: Promise<string> = new Promise((_, reject) => {
      rejectWaiting = reject;
    });
    const rejection = new Error("throws async error test");
    const { result, error, container } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "update-async-throw-test",
      "init"
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe("init");
    expect(result.current[1]).toBeInstanceOf(Function);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_HTML);

    const [, update] = result.current;

    await act(() => update(() => waiting));

    expect(result.current).toBeUndefined();
    expect(result.all).toHaveLength(2);
    expect(container.innerHTML).toMatch(SUSPENDED_TEST_COMPONENT_HTML);

    // We have to wait for the promise to complete
    await act(async () => {
      rejectWaiting(rejection);

      await waiting.catch(() => {});
    });

    expect(result.current).toBeUndefined();
    expect(error.current).toBe(rejection);
    expect(container.innerHTML).toMatch(TEST_COMPONENT_ERROR_HTML);
  });
});
