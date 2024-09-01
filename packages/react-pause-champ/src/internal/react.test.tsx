/*
 * @file Test to ensure the behaviour of useRef which we rely on.
 */

import type { JSX } from "react";

import {
  StrictMode,
  act,
  createElement,
  useEffect,
  useRef,
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

    expect(events).toHaveLength(1);
    expect(events).toEqual([{ event: "render", ref: { n: 1 } }]);

    rerender(<MyComponent />);

    expect(events).toHaveLength(2);
    expect(events).toEqual([
      { event: "render", ref: { n: 1 } },
      { event: "render", ref: { n: 1 } },
    ]);
    expect(events[0]!.ref).toBe(events[1]!.ref);
  });

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

    expect(events).toHaveLength(2);
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

    expect(events).toHaveLength(4);
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
    let t: Promise<string> | string = new Promise((r: (s: string) => void) => {
      resolve = r;
    }).then(
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

      return <p>{String(t)}</p>;
    };

    const { rerender } = render(<MyComponent />);

    expect(events).toHaveLength(1);
    expect(events).toEqual([{ event: "render", ref: { n: 1 } }]);

    await act(async () => {
      resolve("foo");

      return t;
    });

    expect(events).toHaveLength(3);
    expect(events).toEqual([
      { event: "render", ref: { n: 1 } },
      { event: "render", ref: { n: 2 } },
      { event: "effect", ref: { n: 2 } },
    ]);
    expect(events[0]!.ref).not.toBe(events[1]!.ref);
    expect(events[1]!.ref).toBe(events[2]!.ref);

    rerender(<MyComponent />);

    expect(events).toHaveLength(4);
    expect(events).toEqual([
      { event: "render", ref: { n: 1 } },
      { event: "render", ref: { n: 2 } },
      { event: "effect", ref: { n: 2 } },
      { event: "render", ref: { n: 2 } },
    ]);
    expect(events[2]!.ref).toBe(events[3]!.ref);
  });
});
