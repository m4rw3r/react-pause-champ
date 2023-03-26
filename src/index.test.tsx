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

function expectThrow(fn: Function, thrown: any) {
  // Silence errors since we are throwing on purpose
  const originalError = console.error;
  console.error = jest.fn();

  expect(fn).toThrow(thrown);

  console.error = originalError;
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

// TODO: Replace Jest with something better (which doesn't dump the whole internet in error messages to the console on passing tests)
function renderHook<P extends any[], T>(
  renderCallback: (...args: P) => T,
  options: { wrapper?: ComponentType } = {},
  ...args: P
): RenderHookResult<P, T> {
  const { wrapper: Wrapper = Fragment } = options;
  let theError: any = { current: undefined, all: [] };
  let result: any = { current: undefined, all: [] };

  class ErrorBoundary extends Component<{ children: ReactNode }> {
    state = { hasError: false };
    static getDerivedStateFromError() {
      return { hasError: true };
    }
    componentDidCatch(error: Error, _info: ErrorInfo) {
      theError.current = error;
      theError.all.push(error);
    }

    render() {
      if (this.state.hasError) {
        // bricked
        return null;
      }

      return this.props.children;
    }
  }

  function TestComponent({ args }: { args: any }) {
    const pendingResult = renderCallback(...args);

    useEffect(() => {
      result.current = pendingResult;
      result.all.push(pendingResult);
    });

    return null;
  }

  const {
    rerender: baseRerender,
    container,
    unmount,
  } = render(
    <Wrapper>
      <ErrorBoundary>
        <TestComponent args={args} />
      </ErrorBoundary>
    </Wrapper>
  );

  function rerender(...args: P) {
    baseRerender(
      <Wrapper>
        <ErrorBoundary>
          <TestComponent args={args} />
        </ErrorBoundary>
      </Wrapper>
    );
  }

  return { result, rerender, error: theError, unmount };
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
    const waiting = new Promise((_, reject) => {
      rejectWaiting = reject;
    });
    const rejection = new Error("throws async error test");
    const C = () => {
      useWeird("async-throw-test", () => waiting);
      return null;
    };

    const { result, error } = renderHook(
      useWeird,
      { wrapper: Wrapper },
      "async-throw-test",
      () => waiting
    );

    expect(result.current).toBeUndefined();

    // TODO: Suppress error from this
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
      kind: "data",
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
      kind: "data",
      value: testObject,
    });
    expect(getData(storage).get("test2")).toEqual(undefined);

    await rerender("test2", testObject2);

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject2);
    expect(getData(storage).get("test2")).toEqual({
      kind: "data",
      value: testObject2,
    });
    expect(getData(storage).get("test")).toEqual(undefined);

    await rerender("test", testObject2);

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject2);
    expect(getData(storage).get("test")).toEqual({
      kind: "data",
      value: testObject2,
    });
    expect(getData(storage).get("test2")).toEqual(undefined);
  });

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
});
