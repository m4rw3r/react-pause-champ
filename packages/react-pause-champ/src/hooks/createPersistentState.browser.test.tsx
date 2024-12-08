import type { JSX } from "react";

import { fireEvent, getByText, render } from "@testing-library/react";

import {
  Provider,
  createStore,
  useChamp,
  createPersistentState,
} from "../index";
import { PERSISTENT_PREFIX } from "./createPersistentState";

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

describe("createPersistentState", () => {
  it("created persistent state does not share data with a normal state with the same name", () => {
    const consoleError = jest.fn();
    // Silence errors
    console.error = consoleError;

    const usePersistent = createPersistentState<{ name: string }>("test");
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
      const [data] = usePersistent(init2);

      renders.push({ name: "MyOtherComponent", data });

      return <p>{data.name}</p>;
    };

    const { container } = render(
      <Provider store={store}>
        <MyComponent />
        <MyOtherComponent />
      </Provider>,
    );
    jest.runAllTimers();

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
          PERSISTENT_PREFIX + "test",
          {
            kind: "value",
            value: obj2,
          },
        ],
      ]),
    );
  });

  it("shares state between multiple components and updates in all", () => {
    const usePersistent = createPersistentState<{ name: string }>("test");
    const sharedObj = { name: "shared-obj" };
    const newObj = { name: "new-obj" };
    const init = jest.fn(() => sharedObj);
    const renders: { name: string; data: { name: string } }[] = [];
    const MyComponent = (): JSX.Element => {
      const [data] = usePersistent(init);

      renders.push({ name: "MyComponent", data });

      return <p>{data.name}</p>;
    };
    const MyOtherComponent = (): JSX.Element => {
      const [data, update] = usePersistent(init);

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
    jest.runAllTimers();

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
          PERSISTENT_PREFIX + "test",
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
          PERSISTENT_PREFIX + "test",
          {
            kind: "value",
            value: newObj,
          },
        ],
      ]),
    );
  });
});
