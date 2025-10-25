import { TrackedPromise, isPromiseDerivedFrom } from "./tracked-promise";

describe("TrackedPromise", () => {
  it("should create a tracked promise that extends Promise", () => {
    const promise = new TrackedPromise((resolve) => {
      resolve("test");
    });

    expect(promise).toBeInstanceOf(Promise);
    expect(promise).toBeInstanceOf(TrackedPromise);
  });

  it("should track promise derivation correctly", () => {
    const parent = new TrackedPromise((resolve) => {
      resolve("test");
    });

    const child = parent.then(() => "child");

    expect(isPromiseDerivedFrom(child, parent)).toBe(true);
  });

  it("should track multiple levels of promise derivation", () => {
    const parent = new TrackedPromise((resolve) => {
      resolve("test");
    });

    const child1 = parent.then(() => "child1");
    const child2 = child1.then(() => "child2");

    expect(isPromiseDerivedFrom(child1, parent)).toBe(true);
    expect(isPromiseDerivedFrom(child2, parent)).toBe(true);
    expect(isPromiseDerivedFrom(child2, child1)).toBe(true);
  });

  it("should handle catch and finally correctly", () => {
    const parent = new TrackedPromise((resolve) => {
      resolve("test");
    });

    const caught = parent.catch(() => "handled");
    const finallyPromise = parent.finally(() => "finally");

    expect(isPromiseDerivedFrom(caught, parent)).toBe(true);
    expect(isPromiseDerivedFrom(finallyPromise, parent)).toBe(true);
  });

  it("should handle undefined child in isPromiseDerivedFrom", () => {
    const parent = new TrackedPromise((resolve) => {
      resolve("test");
    });

    expect(isPromiseDerivedFrom(undefined, parent)).toBe(false);
  });

  it("resolves like a promise", async () => {
    const p = new TrackedPromise((resolve) => resolve(123));

    await expect(p).resolves.toBe(123);
  });

  it("rejects like a promise", async () => {
    const p = new TrackedPromise((_, reject) => reject("rejected"));

    await expect(p).rejects.toBe("rejected");
  });
});

describe("Jest Matchers", () => {
  it("should work with toBePromiseDerivedFrom matcher", () => {
    const parent = new TrackedPromise((resolve) => {
      resolve("test");
    });

    const child = parent.then(() => "child");

    expect(child).toBePromiseDerivedFrom(parent);
  });

  it("should work with promiseDerivedFrom matcher", () => {
    const parent = new TrackedPromise((resolve) => {
      resolve("test");
    });

    const child = parent.then(() => "child");

    expect(child).toEqual(expect.promiseDerivedFrom(parent));
    expect(child).not.toEqual(expect.not.promiseDerivedFrom(parent));
  });

  it("should fail when promise is not derived from parent", () => {
    const parent = new TrackedPromise((resolve) => {
      resolve("test");
    });

    const unrelated = new TrackedPromise((resolve) => {
      resolve("unrelated");
    });

    expect(() => {
      expect(unrelated).toBePromiseDerivedFrom(parent);
    }).toThrow();
  });
});
