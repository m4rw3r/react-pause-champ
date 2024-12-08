import type { JSX } from "react";

import { fireEvent, getByText, render } from "@testing-library/react";

import { Provider, createStore, useChamp, createSharedState } from "../index";
import { listenerCount } from "../internal/store";
import { SHARED_PREFIX } from "./createSharedState";

const oldConsoleError = console.error;
const oldConsoleWarn = console.warn;
let store = createStore();

jest.useFakeTimers();
// TODO: How to duplicate and run the test with <React.StrictMode/>?

beforeEach(() => {
  store = createStore();
});

afterEach(() => {
  console.error = oldConsoleError;
  console.warn = oldConsoleWarn;
});

describe("createSharedState", () => {
  it("created shared state does not share data with a normal state with the same name", () => {
    const consoleError = jest.fn();
    // Silence errors
    console.error = consoleError;

    const useShared = createSharedState<{ name: string }>("test");
    const obj1 = { name: "obj1" };
    const obj2 = { name: "obj2" };
    const init = jest.fn(() => obj1);
    const init2 = jest.fn(() => obj2);
    const renders: { name: string; data: { name: string } }[] = [];
    const MyComponent = (): JSX.Element => {
      const [data] = useChamp("test", init);

      renders.push({ name: "MyComponent", data });

      return <p>{data.name}</p>;
    };
    const MyOtherComponent = (): JSX.Element => {
      const [data] = useShared(init2);

      renders.push({ name: "MyOtherComponent", data });

      return <p>{data.name}</p>;
    };

    const { container } = render(
      <Provider store={store}>
        <MyComponent />
        <MyOtherComponent />
      </Provider>,
    );

    expect(consoleError.mock.calls).toHaveLength(0);
    expect(container.innerHTML).toEqual("<p>obj1</p><p>obj2</p>");
    expect(renders).toEqual([
      { name: "MyComponent", data: obj1 },
      { name: "MyOtherComponent", data: obj2 },
    ]);
    expect(init.mock.calls).toHaveLength(1);
    expect(renders[0]!.data).not.toBe(renders[1]!.data);
    expect(store.data).toEqual(
      new Map([
        [
          "test",
          {
            kind: "value",
            value: obj1,
          },
        ],
        [
          SHARED_PREFIX + "test",
          {
            kind: "value",
            value: obj2,
          },
        ],
      ]),
    );
  });

  it("shares state between multiple components and updates in all", () => {
    const useShared = createSharedState<{ name: string }>("test");
    const sharedObj = { name: "shared-obj" };
    const newObj = { name: "new-obj" };
    const init = jest.fn(() => sharedObj);
    const renders: { name: string; data: { name: string } }[] = [];
    const MyComponent = (): JSX.Element => {
      const [data] = useShared(init);

      renders.push({ name: "MyComponent", data });

      return <p>{data.name}</p>;
    };
    const MyOtherComponent = (): JSX.Element => {
      const [data, update] = useShared(init);

      renders.push({ name: "MyOtherComponent", data });

      return (
        <p>
          <button onClick={() => update(newObj)}>Update</button>
          {data.name}
        </p>
      );
    };
    const { container } = render(
      <Provider store={store}>
        <MyComponent />
        <MyOtherComponent />
      </Provider>,
    );

    expect(container.innerHTML).toEqual(
      "<p>shared-obj</p><p><button>Update</button>shared-obj</p>",
    );
    expect(renders).toEqual([
      { name: "MyComponent", data: sharedObj },
      { name: "MyOtherComponent", data: sharedObj },
    ]);
    expect(init.mock.calls).toHaveLength(1);
    expect(renders[0]!.data).toBe(renders[1]!.data);
    expect(store.data).toEqual(
      new Map([
        [
          SHARED_PREFIX + "test",
          {
            kind: "value",
            value: sharedObj,
          },
        ],
      ]),
    );

    fireEvent.click(getByText(container, "Update"));

    expect(container.innerHTML).toEqual(
      "<p>new-obj</p><p><button>Update</button>new-obj</p>",
    );
    expect(renders).toEqual([
      { name: "MyComponent", data: sharedObj },
      { name: "MyOtherComponent", data: sharedObj },
      { name: "MyComponent", data: newObj },
      { name: "MyOtherComponent", data: newObj },
    ]);
    expect(init.mock.calls).toHaveLength(1);
    expect(renders[0]!.data).toBe(renders[1]!.data);
    expect(store.data).toEqual(
      new Map([
        [
          SHARED_PREFIX + "test",
          {
            kind: "value",
            value: newObj,
          },
        ],
      ]),
    );
  });

  it("removes the state data once all instances consuming it has unmounted", () => {
    const useShared = createSharedState<{ name: string }>("test");
    const sharedObj = { name: "shared-obj" };
    const init = jest.fn(() => sharedObj);
    const MyComponent = (): JSX.Element => {
      const [data] = useShared(init);

      return <p>{data.name}</p>;
    };

    const { container, rerender } = render(
      <Provider store={store}>
        <MyComponent />
        <MyComponent />
        <MyComponent />
      </Provider>,
    );

    expect(container.innerHTML).toEqual(
      "<p>shared-obj</p><p>shared-obj</p><p>shared-obj</p>",
    );
    expect(store.data).toEqual(
      new Map([
        [
          SHARED_PREFIX + "test",
          {
            kind: "value",
            value: sharedObj,
          },
        ],
      ]),
    );
    expect(listenerCount(store, SHARED_PREFIX + "test")).toEqual(3);

    rerender(
      <Provider store={store}>
        <MyComponent />
        <MyComponent />
      </Provider>,
    );

    expect(container.innerHTML).toEqual("<p>shared-obj</p><p>shared-obj</p>");
    expect(store.data).toEqual(
      new Map([
        [
          SHARED_PREFIX + "test",
          {
            kind: "value",
            value: sharedObj,
          },
        ],
      ]),
    );
    expect(listenerCount(store, SHARED_PREFIX + "test")).toEqual(2);

    rerender(
      <Provider store={store}>
        <MyComponent />
      </Provider>,
    );

    expect(container.innerHTML).toEqual("<p>shared-obj</p>");
    expect(store.data).toEqual(
      new Map([
        [
          SHARED_PREFIX + "test",
          {
            kind: "value",
            value: sharedObj,
          },
        ],
      ]),
    );
    expect(listenerCount(store, SHARED_PREFIX + "test")).toEqual(1);

    jest.runAllTimers();

    expect(container.innerHTML).toEqual("<p>shared-obj</p>");
    expect(store.data).toEqual(
      new Map([
        [
          SHARED_PREFIX + "test",
          {
            kind: "value",
            value: sharedObj,
          },
        ],
      ]),
    );
    expect(listenerCount(store, SHARED_PREFIX + "test")).toEqual(1);

    rerender(<Provider store={store}></Provider>);

    expect(container.innerHTML).toEqual("");
    // The delete is deferred so we still have the data
    expect(store.data).toEqual(
      new Map([
        [
          SHARED_PREFIX + "test",
          {
            kind: "value",
            value: sharedObj,
          },
        ],
      ]),
    );
    expect(listenerCount(store, SHARED_PREFIX + "test")).toEqual(0);

    jest.runAllTimers();

    // And now it is gone
    expect(store.data).toEqual(new Map([]));
  });
});
