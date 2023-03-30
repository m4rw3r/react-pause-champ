import { Store } from "./index";

describe("new Store()", () => {
  it("creates a new empty instance", () => {
    const s = new Store();

    expect(s._data).toEqual(new Map());
    expect(s._listeners).toEqual(new Map());
  });

  it("reuses an existing Map instance if supplied", () => {
    const theMap = new Map();

    theMap.set("test", { kind: "value", value: "existing value" });

    const s = new Store(theMap);

    expect(s._data).toBe(theMap);
    expect(s._listeners).toEqual(new Map());
  });

  it("copies data from a Store instance if supplied", () => {
    const store = new Store();
    const testObject = { name: "test-object" };
    const initFn = jest.fn(() => testObject);

    const entry = store.initState("test", initFn);

    expect(entry).toEqual({ kind: "value", value: testObject });
    expect(entry.value).toBe(testObject);
    expect(initFn.mock.calls).toHaveLength(1);

    const s = new Store(store);

    expect(s._data).toEqual(
      new Map([["test", { kind: "value", value: testObject }]])
    );
    expect(s._listeners).toEqual(new Map());

    const newEntry = s.initState("test", initFn);

    expect(newEntry).toEqual({ kind: "value", value: testObject });
    expect(newEntry.value).toBe(testObject);
    expect(initFn.mock.calls).toHaveLength(1);
  });
});
