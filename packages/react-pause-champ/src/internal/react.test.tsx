/*
 * @file Test to ensure the behaviour of useRef which we rely on.
 */

import type { JSX } from "react";

import {
  StrictMode,
  Suspense,
  act,
  createElement,
  useEffect,
  useRef,
  version as reactVersion,
} from "react";
import { render } from "@testing-library/react";

interface ComponentRef {
  n: number;
}

interface ComponentEvent {
  event: string;
  ref: ComponentRef;
}

describe("useRef({})", () => {
  it("should be identical over multiple renders", () => {
    let i = 0;
    const events: ComponentEvent[] = [];

    const MyComponent = (): JSX.Element => {
      const ref = useRef({ n: ++i });

      events.push({ event: "render", ref: ref.current });

      return <p>TestComponent</p>;
    };

    const { rerender } = render(<MyComponent />);

    expect(events).toEqual([{ event: "render", ref: { n: 1 } }]);

    rerender(<MyComponent />);

    expect(events).toEqual([
      { event: "render", ref: { n: 1 } },
      { event: "render", ref: { n: 1 } },
    ]);
    expect(events[0]!.ref).toBe(events[1]!.ref);
  });

  if (reactVersion.startsWith("18.")) {
    it("should be identical over multiple renders in StrictMode, with the exception of the initial render", () => {
      let i = 0;
      const events: ComponentEvent[] = [];

      const MyComponent = () => {
        const ref = useRef({ n: ++i });

        events.push({ event: "render", ref: ref.current });

        return <p>MyComponent</p>;
      };

      const { rerender, container } = render(
        <StrictMode>
          <MyComponent />
        </StrictMode>,
      );

      // In 19 useRef/useCallback/useMemo does NOT change inside a component in
      // StrictMode rendering.
      expect(events).toEqual([
        { event: "render", ref: { n: 1 } },
        { event: "render", ref: { n: 2 } },
      ]);
      // Exception to the rule
      expect(events[0]!.ref).not.toBe(events[1]!.ref);

      expect(container.innerHTML).toEqual("<p>MyComponent</p>");

      rerender(
        <StrictMode>
          <MyComponent />
        </StrictMode>,
      );

      expect(events).toEqual([
        { event: "render", ref: { n: 1 } },
        { event: "render", ref: { n: 2 } },
        { event: "render", ref: { n: 2 } },
        { event: "render", ref: { n: 2 } },
      ]);

      expect(events[1]!.ref).toBe(events[2]!.ref);
      expect(events[2]!.ref).toBe(events[3]!.ref);
    });

    it("discards the pre-suspend data if we suspend on initial render", async () => {
      let resolve: (s: string) => void;
      let i = 0;
      let t: Promise<string> | string = new Promise(
        (r: (s: string) => void) => {
          resolve = r;
        },
      ).then(
        (s: string) => {
          t = s;
          return s;
        },
        () => "error",
      );
      const events: ComponentEvent[] = [];

      const MyComponent = () => {
        const ref = useRef({ n: ++i });

        events.push({ event: "render", ref: ref.current });

        useEffect(() => {
          events.push({ event: "effect", ref: ref.current });

          return () => {
            // eslint-disable-next-line react-hooks/exhaustive-deps
            events.push({ event: "effect.remove", ref: ref.current });
          };
        }, [ref]);

        if (typeof t === "object" && typeof t.then === "function") {
          throw t;
        }

        return <p>{t as string}</p>;
      };

      const { rerender } = render(<MyComponent />);

      expect(events).toEqual([{ event: "render", ref: { n: 1 } }]);

      await act(async () => {
        resolve("foo");

        return t;
      });

      expect(events).toEqual([
        { event: "render", ref: { n: 1 } },
        { event: "render", ref: { n: 2 } },
        { event: "effect", ref: { n: 2 } },
      ]);
      expect(events[0]!.ref).not.toBe(events[1]!.ref);
      expect(events[1]!.ref).toBe(events[2]!.ref);

      rerender(<MyComponent />);

      expect(events).toEqual([
        { event: "render", ref: { n: 1 } },
        { event: "render", ref: { n: 2 } },
        { event: "effect", ref: { n: 2 } },
        { event: "render", ref: { n: 2 } },
      ]);
      expect(events[2]!.ref).toBe(events[3]!.ref);
    });
  } else if (reactVersion.startsWith("19.")) {
    it("should be identical over multiple renders in StrictMode, with the exception of the initial render", () => {
      let i = 0;
      const events: ComponentEvent[] = [];

      const MyComponent = () => {
        const ref = useRef({ n: ++i });

        events.push({ event: "render", ref: ref.current });

        return <p>MyComponent</p>;
      };

      const { rerender, container } = render(
        <StrictMode>
          <MyComponent />
        </StrictMode>,
      );

      // Difference here depending on React 18 or 19
      // In 19 useRef/useCallback/useMemo does NOT change inside a component in
      // StrictMode rendering.
      expect(events).toEqual([
        { event: "render", ref: { n: 1 } },
        { event: "render", ref: { n: 1 } },
      ]);
      // Now these are the same
      expect(events[0]!.ref).toBe(events[1]!.ref);

      expect(container.innerHTML).toEqual("<p>MyComponent</p>");

      rerender(
        <StrictMode>
          <MyComponent />
        </StrictMode>,
      );

      expect(events).toEqual([
        { event: "render", ref: { n: 1 } },
        { event: "render", ref: { n: 1 } },
        { event: "render", ref: { n: 1 } },
        { event: "render", ref: { n: 1 } },
      ]);

      expect(events[1]!.ref).toBe(events[2]!.ref);
      expect(events[2]!.ref).toBe(events[3]!.ref);
    });

    it("discards the pre-suspend data if we suspend on initial render", async () => {
      let resolve: (s: string) => void;
      let i = 0;
      let t: Promise<string> | string = new Promise(
        (r: (s: string) => void) => {
          resolve = r;
        },
      ).then(
        (s: string) => {
          t = s;
          return s;
        },
        () => "error",
      );
      const events: ComponentEvent[] = [];

      const MyComponent = () => {
        const ref = useRef({ n: ++i });

        events.push({ event: "render", ref: ref.current });

        useEffect(() => {
          events.push({ event: "effect", ref: ref.current });

          return () => {
            // eslint-disable-next-line react-hooks/exhaustive-deps
            events.push({ event: "effect.remove", ref: ref.current });
          };
        }, [ref]);

        if (typeof t === "object" && typeof t.then === "function") {
          throw t;
        }

        return <p>{t as string}</p>;
      };

      const { rerender } = render(<MyComponent />);

      expect(events).toEqual([
        { event: "render", ref: { n: 1 } },
        { event: "render", ref: { n: 2 } }, // Double render here, probably the "pre-warm"
      ]);

      await act(async () => {
        resolve("foo");

        return t;
      });

      expect(events).toEqual([
        { event: "render", ref: { n: 1 } },
        { event: "render", ref: { n: 2 } }, // Pre-warm
        { event: "render", ref: { n: 3 } }, // Final render
        { event: "effect", ref: { n: 3 } },
      ]);
      expect(events[0]!.ref).not.toBe(events[1]!.ref);
      expect(events[1]!.ref).not.toBe(events[2]!.ref);
      expect(events[2]!.ref).toBe(events[3]!.ref);

      rerender(<MyComponent />);

      expect(events).toEqual([
        { event: "render", ref: { n: 1 } },
        { event: "render", ref: { n: 2 } }, // Pre-warm
        { event: "render", ref: { n: 3 } }, // Finished render
        { event: "effect", ref: { n: 3 } },
        { event: "render", ref: { n: 3 } }, // Re-render
      ]);
      expect(events[2]!.ref).toBe(events[3]!.ref);
      expect(events[3]!.ref).toBe(events[4]!.ref);
    });
  } else {
    throw new Error(`Unknown react version ${reactVersion}`);
  }
});

describe("Component", () => {
  let events: { event: string; name: string }[] = [];
  const makePromiseObject = () => {
    let resolve: (value: string) => void;
    const value: {
      value: Promise<string> | string;
      resolve: (resolved: string) => Promise<string>;
    } = {
      value: new Promise((resolveFn) => {
        resolve = resolveFn;
      }),
      resolve: (resolved: string) => {
        const p = value.value;

        if (typeof p === "object" && typeof p.then === "function") {
          value.value = resolved;

          resolve(resolved);

          return p;
        } else {
          throw new Error("Promise object has already been resoled");
        }
      },
    };

    return value;
  };
  const makeComponent = (
    name: string,
    value: { value: Promise<string> | string },
  ) =>
    function ThrowingComponent() {
      events.push({ event: "render", name });

      if (
        typeof value.value === "object" &&
        typeof value.value.then === "function"
      ) {
        events.push({ event: "throw", name });

        throw value.value;
      }

      return <p>{value.value as string}</p>;
    };

  const Fallback = () => <div>Fallback</div>;

  if (reactVersion.startsWith("18.")) {
    // React 18 renders in parallel
    it("Should render in parallel without Suspense", async () => {
      events = [];
      const value1 = makePromiseObject();
      const value2 = makePromiseObject();

      const MyComponent1 = makeComponent("1", value1);
      const MyComponent2 = makeComponent("2", value2);

      const { rerender } = render(
        <div>
          <MyComponent1 />
          <MyComponent2 />
        </div>,
      );

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "throw", name: "1" },
        { event: "render", name: "2" },
        { event: "throw", name: "2" },
      ]);
      events = [];

      await act(async () => value1.resolve("value 1"));

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "render", name: "2" },
        { event: "throw", name: "2" },
      ]);
      events = [];

      await act(async () => value2.resolve("value 2"));

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "render", name: "2" },
      ]);
      events = [];

      rerender(
        <div>
          <MyComponent1 />
          <MyComponent2 />
        </div>,
      );

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "render", name: "2" },
      ]);
    });

    it("Should render in parallel with Suspense", async () => {
      events = [];
      const value1 = makePromiseObject();
      const value2 = makePromiseObject();

      const MyComponent1 = makeComponent("1", value1);
      const MyComponent2 = makeComponent("2", value2);

      const { rerender } = render(
        <Suspense fallback={<Fallback />}>
          <MyComponent1 />
          <MyComponent2 />
        </Suspense>,
      );

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "throw", name: "1" },
        { event: "render", name: "2" },
        { event: "throw", name: "2" },
      ]);
      events = [];

      await act(async () => value1.resolve("value 1"));

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "render", name: "2" },
        { event: "throw", name: "2" },
      ]);
      events = [];

      await act(async () => value2.resolve("value 2"));

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "render", name: "2" },
      ]);
      events = [];

      rerender(
        <Suspense fallback={<Fallback />}>
          <MyComponent1 />
          <MyComponent2 />
        </Suspense>,
      );

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "render", name: "2" },
      ]);
    });
  } else if (reactVersion.startsWith("19.")) {
    it("Should render in parallel without Suspense", async () => {
      events = [];
      const value1 = makePromiseObject();
      const value2 = makePromiseObject();

      const MyComponent1 = makeComponent("1", value1);
      const MyComponent2 = makeComponent("2", value2);

      const { rerender } = render(
        <div>
          <MyComponent1 />
          <MyComponent2 />
        </div>,
      );

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "throw", name: "1" },
        { event: "render", name: "2" },
        { event: "throw", name: "2" },
      ]);
      events = [];

      await act(async () => value1.resolve("value 1"));

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "render", name: "2" },
        { event: "throw", name: "2" },
        // No idea why it does this here, maybe related to pre-warm?
        { event: "render", name: "1" },
        { event: "render", name: "2" },
        { event: "throw", name: "2" },
      ]);
      events = [];

      await act(async () => value2.resolve("value 2"));

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "render", name: "2" },
      ]);
      events = [];

      rerender(
        <div>
          <MyComponent1 />
          <MyComponent2 />
        </div>,
      );

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "render", name: "2" },
      ]);
    });

    it("Should render in parallel with Suspense", async () => {
      events = [];
      const value1 = makePromiseObject();
      const value2 = makePromiseObject();

      const MyComponent1 = makeComponent("1", value1);
      const MyComponent2 = makeComponent("2", value2);

      const { rerender } = render(
        <Suspense fallback={<Fallback />}>
          <MyComponent1 />
          <MyComponent2 />
        </Suspense>,
      );

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "throw", name: "1" },
        // "Pre-warm" renders
        //
        // Render all the siblings once the first one has suspended and commited
        // to DOM. Unfortunate that React does not keep the calculation from
        // above as an optimization
        //
        // See: https://github.com/facebook/react/issues/29898#issuecomment-2477449973
        { event: "render", name: "1" },
        { event: "throw", name: "1" },
        { event: "render", name: "2" },
        { event: "throw", name: "2" },
      ]);
      events = [];

      await act(async () => value1.resolve("value 1"));

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "render", name: "2" },
        { event: "throw", name: "2" },
        // "Prewarm" again, which in this case just renders both again
        { event: "render", name: "1" },
        { event: "render", name: "2" },
        { event: "throw", name: "2" },
      ]);
      events = [];

      await act(async () => value2.resolve("value 2"));

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "render", name: "2" },
      ]);
      events = [];

      rerender(
        <Suspense fallback={<Fallback />}>
          <MyComponent1 />
          <MyComponent2 />
        </Suspense>,
      );

      expect(events).toEqual([
        { event: "render", name: "1" },
        { event: "render", name: "2" },
      ]);
    });
  } else {
    throw new Error(`Unknown react version ${reactVersion}`);
  }
});
