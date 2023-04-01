/**
 * State-data entry.
 *
 * If the entry is in the "suspended" state its content will be replaced with
 * the appropriate variant once the promise resolves.
 *
 * Note: Promise resolution and internal entry-updates will not be notified
 * through listeners on Store.
 *
 * @see newEntry()
 * @see unwrapEntry()
 */
export type Entry<T> =
  | { kind: "value"; value: T }
  | { kind: "suspended"; value: Promise<T> }
  | { kind: "error"; value: Error };

/**
 * Creates a new Entry from the given maybe-promise. If it is a promise
 * it will be modified upon promise resolution/rejection into an appropriate
 * state.
 *
 * @internal
 */
export function newEntry<T>(value: Promise<T> | T): Entry<T> {
  // Special-casing the non-promise case to avoid an extra re-render on
  // state initialization.
  if (!isThenable(value)) {
    return { kind: "value", value };
  }

  const suspendable: Entry<T> = {
    kind: "suspended",
    value: value.then(
      (value) => {
        suspendable.kind = "value";
        suspendable.value = value;

        return value;
      },
      (error) => {
        suspendable.kind = "error";
        suspendable.value = error;

        throw error;
      }
    ),
  };

  return suspendable;
}

/**
 * Extracts the contents of the entry if it is a value, otherwise an Error or
 * Promise will be thrown.
 *
 * @internal
 */
export function unwrapEntry<T>(entry: Entry<T>): T {
  if (entry.kind !== "value") {
    // Error or Suspense-Promise to throw
    throw entry.value;
  }

  return entry.value;
}

/**
 * @internal
 */
export function isThenable<T>(value: any): value is Promise<T> {
  return typeof value?.then === "function";
}
