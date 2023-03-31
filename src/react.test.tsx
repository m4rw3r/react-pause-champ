import {
  StrictMode,
  createElement,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { render, act } from "@testing-library/react";

interface ComponentRef {
  n: number;
}

interface ComponentEvent {
  event: string;
  ref: ComponentRef;
}

describe("useRef({})", () => {
  it("should be identical over multiple renders", async () => {
    let i = 0;
    const events: Array<ComponentEvent> = [];

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

  it("should be identical over multiple renders in StrictMode, with the exception of the initial render", async () => {
    let i = 0;
    const events: Array<ComponentEvent> = [];

    const MyComponent = () => {
      const ref = useRef({ n: ++i });

      events.push({ event: "render", ref: ref.current });

      return <p>MyComponent</p>;
    };

    const { rerender, container } = render(
      <StrictMode>
        <MyComponent />
      </StrictMode>
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
      </StrictMode>
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
      () => "error"
    );
    const events: Array<ComponentEvent> = [];

    const MyComponent = () => {
      const ref = useRef({ n: ++i });

      events.push({ event: "render", ref: ref.current });

      useEffect(() => {
        events.push({ event: "effect", ref: ref.current });

        return () => {
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

describe("useSyncExternalStore()", () => {
  it("2x init, subscribe, init", async () => {
    let i = 0;
    const dataObj = { name: "data-obj" };
    const events: Array<ComponentEvent> = [];

    const MyComponent = () => {
      const ref = useRef({ n: ++i });

      events.push({ event: "render", ref: ref.current });

      const { subscribe, init, serverInit } = useMemo(() => {
        events.push({ event: "memo", ref: ref.current });

        return {
          subscribe: () => {
            events.push({ event: "subscribe", ref: ref.current });

            return () => {
              events.push({ event: "unsubscribe", ref: ref.current });
            };
          },
          init: () => {
            events.push({ event: "init", ref: ref.current });

            return dataObj;
          },
          serverInit: () => {
            events.push({ event: "serverInit", ref: ref.current });

            return dataObj;
          },
        };
      }, []);

      const data = useSyncExternalStore(subscribe, init, serverInit);

      return <p>{JSON.stringify(data)}</p>;
    };

    const { rerender, container } = render(<MyComponent />);

    expect(events).toHaveLength(6);
    expect(events).toEqual([
      { event: "render", ref: { n: 1 } },
      { event: "memo", ref: { n: 1 } },
      // doule init because of dev-mode
      { event: "init", ref: { n: 1 } },
      { event: "init", ref: { n: 1 } },
      { event: "subscribe", ref: { n: 1 } },
      // another init to make sure from useSyncExternalStore
      { event: "init", ref: { n: 1 } },
    ]);
    expect(events[0]!.ref).toBe(events[1]!.ref);
    expect(events[1]!.ref).toBe(events[2]!.ref);
    expect(events[2]!.ref).toBe(events[3]!.ref);
    expect(events[3]!.ref).toBe(events[4]!.ref);
    expect(container.innerHTML).toEqual('<p>{"name":"data-obj"}</p>');

    rerender(<MyComponent />);

    expect(events).toHaveLength(9);
    expect(events).toEqual([
      { event: "render", ref: { n: 1 } },
      { event: "memo", ref: { n: 1 } },
      { event: "init", ref: { n: 1 } },
      { event: "init", ref: { n: 1 } },
      { event: "subscribe", ref: { n: 1 } },
      { event: "init", ref: { n: 1 } },
      { event: "render", ref: { n: 1 } },
      { event: "init", ref: { n: 1 } },
      { event: "init", ref: { n: 1 } },
    ]);
    expect(events[4]!.ref).toBe(events[5]!.ref);
    expect(events[5]!.ref).toBe(events[6]!.ref);
    expect(container.innerHTML).toEqual('<p>{"name":"data-obj"}</p>');
  });

  it("2x init, subscribe, init, StrictMode", async () => {
    let i = 0;
    const dataObj = { name: "data-obj" };
    const events: Array<ComponentEvent> = [];

    const MyComponent = () => {
      const ref = useRef({ n: ++i });

      events.push({ event: "render", ref: ref.current });

      const { subscribe, init, serverInit } = useMemo(() => {
        events.push({ event: "memo", ref: ref.current });

        return {
          subscribe: () => {
            events.push({ event: "subscribe", ref: ref.current });

            return () => {
              events.push({ event: "unsubscribe", ref: ref.current });
            };
          },
          init: () => {
            events.push({ event: "init", ref: ref.current });

            return dataObj;
          },
          serverInit: () => {
            events.push({ event: "serverInit", ref: ref.current });

            return dataObj;
          },
        };
      }, []);

      const data = useSyncExternalStore(subscribe, init, serverInit);

      return <p>{JSON.stringify(data)}</p>;
    };

    const { rerender, container } = render(
      <StrictMode>
        <MyComponent />
      </StrictMode>
    );

    expect(events).toHaveLength(13);
    expect(events).toEqual([
      { event: "render", ref: { n: 1 } },
      { event: "memo", ref: { n: 1 } },
      { event: "init", ref: { n: 1 } },
      { event: "init", ref: { n: 1 } },
      // "real" render
      { event: "render", ref: { n: 2 } },
      { event: "memo", ref: { n: 2 } },
      { event: "init", ref: { n: 2 } },
      { event: "init", ref: { n: 2 } },
      { event: "subscribe", ref: { n: 2 } },
      { event: "init", ref: { n: 2 } },
      { event: "unsubscribe", ref: { n: 2 } },
      { event: "subscribe", ref: { n: 2 } },
      { event: "init", ref: { n: 2 } },
    ]);
    expect(events[0]!.ref).toBe(events[1]!.ref);
    expect(events[1]!.ref).toBe(events[2]!.ref);
    expect(events[2]!.ref).toBe(events[3]!.ref);
    expect(events[3]!.ref).not.toBe(events[4]!.ref);
    expect(events[4]!.ref).toBe(events[5]!.ref);
    expect(events[5]!.ref).toBe(events[6]!.ref);
    expect(events[6]!.ref).toBe(events[7]!.ref);
    expect(events[7]!.ref).toBe(events[8]!.ref);
    expect(events[8]!.ref).toBe(events[9]!.ref);
    expect(events[9]!.ref).toBe(events[10]!.ref);
    expect(events[10]!.ref).toBe(events[11]!.ref);
    expect(events[11]!.ref).toBe(events[12]!.ref);
    expect(container.innerHTML).toEqual('<p>{"name":"data-obj"}</p>');

    rerender(
      <StrictMode>
        <MyComponent />
      </StrictMode>
    );

    expect(events).toHaveLength(19);
    expect(events).toEqual([
      { event: "render", ref: { n: 1 } },
      { event: "memo", ref: { n: 1 } },
      { event: "init", ref: { n: 1 } },
      { event: "init", ref: { n: 1 } },
      // "real" render
      { event: "render", ref: { n: 2 } },
      { event: "memo", ref: { n: 2 } },
      { event: "init", ref: { n: 2 } },
      { event: "init", ref: { n: 2 } },
      { event: "subscribe", ref: { n: 2 } },
      { event: "init", ref: { n: 2 } },
      { event: "unsubscribe", ref: { n: 2 } },
      { event: "subscribe", ref: { n: 2 } },
      { event: "init", ref: { n: 2 } },
      // rerender
      { event: "render", ref: { n: 2 } },
      { event: "init", ref: { n: 2 } },
      { event: "init", ref: { n: 2 } },
      // actual rerender
      { event: "render", ref: { n: 2 } },
      { event: "init", ref: { n: 2 } },
      { event: "init", ref: { n: 2 } },
    ]);
    expect(events[12]!.ref).toBe(events[13]!.ref);
    expect(events[13]!.ref).toBe(events[14]!.ref);
    expect(events[14]!.ref).toBe(events[15]!.ref);
    expect(events[15]!.ref).toBe(events[16]!.ref);
    expect(events[16]!.ref).toBe(events[17]!.ref);
    expect(events[17]!.ref).toBe(events[18]!.ref);
    expect(container.innerHTML).toEqual('<p>{"name":"data-obj"}</p>');
  });
});
