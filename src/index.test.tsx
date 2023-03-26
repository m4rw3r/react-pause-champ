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

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.log("Catched", error);
    lastError = error;
  }

  render() {
    if (this.state.error) {
      return <p className="error">{String(this.state.error)}</p>;
    }

    return this.props.children;
  }
}

let lastError: Error | null = null;
let storage = new Storage();

function Wrapper({ children }: { children?: ReactNode }): JSX.Element {
  return (
    <ErrorBoundary>
      <WrapperNoCatch>{children}</WrapperNoCatch>
    </ErrorBoundary>
  );
}

function WrapperNoCatch({ children }: { children?: ReactNode }): JSX.Element {
  return (
    <Provider storage={storage}>
      <Suspense fallback={null}>{children}</Suspense>
    </Provider>
  );
}

function expectThrow(fn: Function, thrown: any) {
  // Silence errors since we are throwing on purpose
  const originalError = console.error;
  console.error = jest.fn();

  expect(fn).toThrow(thrown);

  console.error = originalError;
}

interface Ref<T> {
  current: T | null;
  all: Array<T>;
}

interface RenderHookResult<P extends any[], T> {
  result: Ref<T | null>;
  error: Ref<Error | null>;
  rerender: (...args: P) => void;
  unmount: () => void;
}

function renderHook<P extends any[], T>(
  renderCallback: (...args: P) => T,
  options: { args?: P; wrapper?: ComponentType } = {}
): RenderHookResult<P, T> {
  const { args = [], wrapper: Wrapper = Fragment } = options;
  let theError: Ref<Error> = { current: null, all: [] };
  let result: Ref<T> = { current: null, all: [] };

  class C extends Component<{ children: ReactNode }> {
    componentDidCatch(error: Error, _info: ErrorInfo) {
      theError.current = error;
      theError.all.push(error);
    }

    render() {
      if (theError) {
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
  lastError = null;
  storage = new Storage();
});

describe("useWeird()", () => {
  it("throws when no <Provider/> wraps it", () => {
    expectThrow(
      () => renderHook(() => useWeird("test", 123)),
      new Error("useWeird() must be inside a <Weird.Provider/>")
    );
  });

  it("throws errors", () => {
    expectThrow(
      () =>
        renderHook(
          () =>
            useWeird("throw-test", () => {
              throw new Error("throws error test");
            }),
          { wrapper: WrapperNoCatch }
        ),
      new Error("throws error test")
    );
  });

  it("throws async errors", async () => {
    // This does not throw when expected since we need to have useEffect
    let rejectWaiting: (error: Error) => void;
    const waiting = new Promise((_, reject) => {
      rejectWaiting = reject;
    });
    const error = new Error("throws async error test");
    const C = () => {
      useWeird("async-throw-test", () => waiting);
      return null;
    };

    const { result } = renderHook(
      () => useWeird("async-throw-test", () => waiting),
      { wrapper: Wrapper }
    );

    /*
    const { container } = render(
      <Wrapper>
        <C />
      </Wrapper>
    );
	*/

    expect(result.current).toBeNull();

    await act(() => rejectWaiting(error));

    console.log("We are checking");

    expect(result.current).toBeNull();
    expect(lastError).toBe(error);
  });

  it("returns the init argument as the first element", async () => {
    const testObject1 = { test: "test-object-1" };
    const testObject2 = { test: "test-object-2" };
    const { result, rerender } = renderHook(
      ({ value }) => useWeird("test", value),
      { initialProps: { value: testObject1 }, wrapper: Wrapper }
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject1);
    await rerender({ value: testObject2 });
    expect(result.current[0]).toBe(testObject1);
    await rerender({ value: testObject2 });
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
      ({ id, value }) => useWeird(id, value),
      {
        initialProps: { id: "test", value: testObject },
        wrapper: Wrapper,
      }
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject);
    expect(getData(storage).get("test")).toEqual({
      kind: "data",
      value: testObject,
    });
    expect(getData(storage).get("test2")).toEqual(undefined);

    await rerender({ id: "test2", value: testObject2 });

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(testObject2);
    expect(getData(storage).get("test2")).toEqual({
      kind: "data",
      value: testObject2,
    });
    expect(getData(storage).get("test")).toEqual(undefined);

    await rerender({ id: "test", value: testObject2 });

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
      ({ id, value }) => useWeird(id, value),
      {
        initialProps: { id: "test", value: 1 },
        wrapper: Wrapper,
      }
    );

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(1);
    expect(result.current[1]).toBeInstanceOf(Function);

    const [, update] = result.current;

    await act(() => update(2));

    expect(result.current[0]).toBe(2);
  });
});
