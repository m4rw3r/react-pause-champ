import { createStore, fromSnapshot } from "./store";

describe("createStore()", () => {
  it("creates a new empty instance", () => {
    const s = createStore();

    expect(s.data).toEqual(new Map());
    expect(s.listeners).toEqual(new Map());
    expect(s.snapshot).toBeUndefined();
    expect(s.meta).toEqual(new Map());
  });
});

describe("fromSnapshot()", () => {
  it("populates the _snapshot property with the same instance as it is passed", () => {
    const m = new Map();
    const s = fromSnapshot(m);

    expect(s.data).toEqual(new Map());
    expect(s.listeners).toEqual(new Map());
    expect(s.snapshot).toBe(m);
    expect(s.meta).toEqual(new Map());
  });
});
