/**
 * @jest-environment node
 */

import { Suspense } from "react";
import { Provider, useChamp, createStore } from "../index";
import {
  REACT_STREAMING_SCRIPT,
  renderToStream,
} from "../internal/testutils.node";

describe("useChamp()", () => {
  it("throws when no <Provider/> is used", async () => {
    const MyComponent = () => {
      const [data] = useChamp("test", 123);

      return <p>{data}</p>;
    };
    const stream = renderToStream(<MyComponent />);

    await expect(stream).rejects.toEqual(
      new Error("useChamp() must be inside a <Provider/>."),
    );

    expect(stream.errors).toEqual([
      new Error("useChamp() must be inside a <Provider/>."),
    ]);
  });

  it("renders the value", async () => {
    const MyComponent = () => {
      const [data] = useChamp("test", 123);

      return <p>{data}</p>;
    };
    const store = createStore();
    const stream = renderToStream(
      <Provider store={store}>
        <MyComponent />
      </Provider>,
    );

    await expect(stream).resolves.toEqual("<p>123</p>");

    expect(stream.errors).toEqual([]);
  });

  it("waits with rendering in async and produces the full result at once", async () => {
    let resolveWaiting: (str: string) => void;
    const waiting = new Promise<string>((resolve) => {
      resolveWaiting = resolve;
    });
    const MyComponent = () => {
      const [data] = useChamp("test", () => waiting);

      return <p>{data}</p>;
    };
    const store = createStore();
    const stream = renderToStream(
      <Provider store={store}>
        <MyComponent />
      </Provider>,
    );

    expect(stream.buffer).toHaveLength(0);

    resolveWaiting!("asdf");

    expect(stream.buffer).toHaveLength(0);
    await expect(stream).resolves.toEqual("<p>asdf</p>");
    expect(stream.buffer).toHaveLength(1);
    expect(stream.errors).toEqual([]);
  });

  it("rethrows errors in the render-path", async () => {
    const MyComponent = () => {
      const [data] = useChamp("test", () => {
        throw new Error("Error test");
      });

      return <p>{data}</p>;
    };
    const store = createStore();
    const stream = renderToStream(
      <Provider store={store}>
        <MyComponent />
      </Provider>,
    );

    expect(stream.buffer).toHaveLength(0);
    expect(stream.errors).toEqual([]);
    await expect(stream).rejects.toEqual(new Error("Error test"));
    expect(stream.buffer).toHaveLength(0);
    expect(stream.errors).toEqual([new Error("Error test")]);
  });

  it("rethrows asynchronous errors in the render-path", async () => {
    let rejectWaiting: (err: Error) => void;
    const waiting = new Promise<string>((_, reject) => {
      rejectWaiting = reject;
    });

    // We have to catch this because otherwise Jest/Node will think we do not
    // yet have any installed handler since the shell has not yet started rendering
    const catchFn = jest.fn();
    waiting.catch((err: unknown): void => {
      catchFn(err);
    });

    const MyComponent = () => {
      const [data] = useChamp("test", () => waiting);

      return <p>{data}</p>;
    };
    const store = createStore();
    const stream = renderToStream(
      <Provider store={store}>
        <MyComponent />
      </Provider>,
    );

    expect(stream.buffer).toHaveLength(0);
    expect(stream.errors).toEqual([]);

    rejectWaiting!(new Error("The error from the test"));

    expect(stream.buffer).toHaveLength(0);
    await expect(stream).rejects.toEqual(new Error("The error from the test"));
    expect(stream.buffer).toHaveLength(0);
    expect(stream.errors).toEqual([new Error("The error from the test")]);
  });

  it("with Suspense renders an empty component on async and then streams the update", async () => {
    let resolveWaiting: (str: string) => void;
    const waiting = new Promise<string>((resolve) => {
      resolveWaiting = resolve;
    });
    const MyComponent = () => {
      const [data] = useChamp("test", () => waiting);

      return <p>{data}</p>;
    };
    const store = createStore();
    const stream = renderToStream(
      // The <div> is required to get the Suspense boundary to render the fallback
      <div>
        <Provider store={store}>
          <Suspense fallback={"foobar"}>
            <MyComponent />
          </Suspense>
        </Provider>
      </div>,
    );

    expect(stream.buffer).toHaveLength(0);
    // Note: The syntax for placeholders can be changed at some point by React
    await expect(stream.chunk()).resolves.toEqual(
      `<div><!--$?--><template id="B:0"></template>foobar<!--/$--></div>`,
    );
    expect(stream.buffer).toHaveLength(1);
    expect(stream.errors).toEqual([]);

    resolveWaiting!("asdf");

    expect(stream.buffer).toHaveLength(1);
    await expect(stream).resolves.toEqual(
      `<div><!--$?--><template id="B:0"></template>foobar<!--/$--></div><div hidden id="S:0"><p>asdf</p></div>${REACT_STREAMING_SCRIPT}`,
    );
    expect(stream.buffer).toHaveLength(2);
    expect(stream.errors).toEqual([]);
  });

  it("with Suspense renders and empty component and then updates with the thrown version", async () => {
    let rejectWaiting: (err: Error) => void;
    const waiting = new Promise<string>((_, reject) => {
      rejectWaiting = reject;
    });

    const MyComponent = () => {
      const [data] = useChamp("test", () => waiting);

      return <p>{data}</p>;
    };
    const store = createStore();
    const stream = renderToStream(
      <div>
        <Provider store={store}>
          <Suspense fallback={"foobar"}>
            <MyComponent />
          </Suspense>
        </Provider>
      </div>,
    );

    expect(stream.buffer).toHaveLength(0);
    expect(stream.errors).toEqual([]);

    await expect(stream.chunk()).resolves.toEqual(
      `<div><!--$?--><template id="B:0"></template>foobar<!--/$--></div>`,
    );

    rejectWaiting!(new Error("The error from the test"));

    expect(stream.buffer).toHaveLength(1);
    await expect(stream).rejects.toEqual(new Error("The error from the test"));
    expect(stream.buffer).toHaveLength(2);
    expect(stream.buffer[1]).toMatch(/The error from the test/);
    expect(stream.buffer[1]).toMatch(/at MyComponent/);
    expect(stream.errors).toEqual([new Error("The error from the test")]);
  });
});

// TODO: More tests
