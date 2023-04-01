import { Store, fromSnapshot } from "./store";

describe("new Store()", () => {
  it("creates a new empty instance", () => {
    const s = new Store();

    expect(s._data).toEqual(new Map());
    expect(s._listeners).toEqual(new Map());
    expect(s._snapshot).toBeUndefined();
    expect(s._meta).toBeUndefined();
  });
});

describe("fromSnapshot()", () => {
  it("populates the _snapshot property with the same instance as it is passed", () => {
    const m = new Map();
    const s = fromSnapshot(m);

    expect(s._data).toEqual(new Map());
    expect(s._listeners).toEqual(new Map());
    expect(s._snapshot).toBe(m);
    expect(s._meta).toBeUndefined();
  });
});
