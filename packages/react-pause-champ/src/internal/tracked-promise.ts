/**
 * Jest helper which tracks promises created in the tests and allows for
 * matching on promises derived from them.
 */

import { isThenable } from "./entry";

declare global {
  // We have to use the namespace here, attempting it on a module level makes
  // TypeScript fail to resolve jest for augmentation
  //
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Expect {
      promiseDerivedFrom(parent: Promise<unknown>): void;
    }
    interface Matchers<R> {
      toBePromiseDerivedFrom(parent: Promise<unknown>): R;
    }
    interface AsymmetricMatchers {
      promiseDerivedFrom(parent: Promise<unknown>): void;
    }
    interface InverseAsymmetricMatchers {
      promiseDerivedFrom(parent: Promise<unknown>): void;
    }
  }
}

/**
 * Tracked version of a promise, any derived promises will have a reference to
 * this allowing for expect tests.
 */
export class TrackedPromise<T> extends Promise<T> {
  /**
   * @internal
   */
  public _derivedFrom: TrackedPromise<unknown> | undefined;

  constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void,
    ) => void,
  ) {
    super(executor);

    const tracked = trackPromise(this);

    if (tracked !== this) {
      // Just to keep the lint happy
      throw new Error("Created tracked promise is actually not tracked");
    }
  }
}

/* eslint-disable @typescript-eslint/unbound-method */
export function trackPromise<T>(
  promise: Promise<T>,
  parent?: TrackedPromise<unknown>,
): TrackedPromise<T> {
  const origThen = promise.then;
  const origCatch = promise.catch;
  const origFinally = promise.finally;

  const tracked = promise as TrackedPromise<T>;

  tracked._derivedFrom = parent;
  tracked.then = function (this: typeof tracked, onfulfilled, onrejected) {
    return trackPromise(origThen.call(this, onfulfilled, onrejected), this);
  } as typeof tracked.then;
  tracked.catch = function (this: typeof tracked, onrejected) {
    return trackPromise(origCatch.call(this, onrejected), this);
  } as typeof tracked.catch;
  tracked.finally = function (onfinally) {
    return trackPromise(origFinally.call(this, onfinally), this);
  };

  return tracked;
}

export function isPromiseDerivedFrom(
  child: Promise<unknown> | undefined,
  parent: Promise<unknown>,
): boolean {
  const seen = new Set();

  while (child && !seen.has(child)) {
    if (child === parent) {
      return true;
    }

    seen.add(child);

    child = (child as TrackedPromise<unknown>)._derivedFrom;
  }

  return false;
}

function toBePromiseDerivedFrom(
  actual: unknown,
  parent: TrackedPromise<unknown>,
) {
  if (!(parent instanceof Promise)) {
    throw new Error("Actual value must be a promise");
  }

  const pass = isThenable(actual) && isPromiseDerivedFrom(actual, parent);

  return {
    pass,
    message: pass
      ? () => `expected promise to not be derived from supplied promise`
      : () => `expected promise to be derived from supplied promise`,
  };
}

expect.extend({
  toBePromiseDerivedFrom(actual: unknown, parent: TrackedPromise<unknown>) {
    return toBePromiseDerivedFrom(actual, parent);
  },
  promiseDerivedFrom(actual: unknown, parent: TrackedPromise<unknown>) {
    return toBePromiseDerivedFrom(actual, parent);
  },
});
