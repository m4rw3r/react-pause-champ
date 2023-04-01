import { Store } from "./store";

describe("new Store()", () => {
  it("creates a new empty instance", () => {
    const s = new Store();

    expect(s._data).toEqual(new Map());
    expect(s._listeners).toEqual(new Map());
  });
});
