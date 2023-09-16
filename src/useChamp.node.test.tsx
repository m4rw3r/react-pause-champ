/**
 * @jest-environment node
 */

import { Suspense, createElement } from "react";
import { canUseDOM } from "./useChamp";
import { Provider, useChamp, createStore } from ".";
import { renderToStream } from "./testutils.node";

describe("canUseDOM()", () => {
  it("should return false in node", () => {
    expect(canUseDOM()).toBe(false);
  });
});

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
    waiting.catch(catchFn);

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
      <Provider store={store}>
        <Suspense fallback={"foobar"}>
          <MyComponent />
        </Suspense>
      </Provider>,
    );

    expect(stream.buffer).toHaveLength(0);
    // Note: The syntax for placeholders can be changed at some point by React
    await expect(stream.chunk()).resolves.toEqual(
      `<!--$?--><template id="B:0"></template>foobar<!--/$-->`,
    );
    expect(stream.buffer).toHaveLength(1);
    expect(stream.errors).toEqual([]);

    resolveWaiting!("asdf");

    expect(stream.buffer).toHaveLength(1);
    await expect(stream).resolves.toEqual(
      `<!--$?--><template id="B:0"></template>foobar<!--/$--><div hidden id="S:0"><p>asdf</p></div><script>function $RC(a,b){a=document.getElementById(a);b=document.getElementById(b);b.parentNode.removeChild(b);if(a){a=a.previousSibling;var f=a.parentNode,c=a.nextSibling,e=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d)if(0===e)break;else e--;else"$"!==d&&"$?"!==d&&"$!"!==d||e++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;b.firstChild;)f.insertBefore(b.firstChild,c);a.data="$";a._reactRetry&&a._reactRetry()}};$RC("B:0","S:0")</script>`,
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
      <Provider store={store}>
        <Suspense fallback={"foobar"}>
          <MyComponent />
        </Suspense>
      </Provider>,
    );

    expect(stream.buffer).toHaveLength(0);
    expect(stream.errors).toEqual([]);

    await expect(stream.chunk()).resolves.toEqual(
      `<!--$?--><template id="B:0"></template>foobar<!--/$-->`,
    );

    rejectWaiting!(new Error("The error from the test"));

    expect(stream.buffer).toHaveLength(1);
    await expect(stream).rejects.toEqual(new Error("The error from the test"));
    expect(stream.buffer).toHaveLength(2);
    expect(stream.buffer[1]).toMatch(/"The error from the test"/);
    expect(stream.buffer[1]).toMatch(/at MyComponent/);
    expect(stream.errors).toEqual([new Error("The error from the test")]);
  });
});

// TODO: More tests
