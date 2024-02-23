/**
 * Initial value or a function creating the initial value for a stateful
 * variable in {@link useChamp}.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @see {@link Update}
 */
export type Init<T> = T | Promise<T> | InitFn<T>;

/**
 * A function creating an initial value for a stateful variable from
 * {@link useChamp}.
 *
 * @remarks
 * This function can also be asynchronous, either by returning a `Promise`, or
 * by using the `async` keyword.
 *
 * Any exception thrown from this function will be caught and rethrown in the
 * component. To manually handle exceptions they will have to be caught using
 * `try`-`catch` and then converted into a value.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @returns The initial value, or a promise which will resolve to the value
 * @see {@link Init}
 * @see {@link useChamp}
 */
export type InitFn<T> = () => T | Promise<T>;

/**
 * A new value, or a function creating a new value, for a stateful variable
 * from {@link useChamp}.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @see {@link Init}
 * @see {@link UpdateCallback}
 */
export type Update<T> = T | Promise<T> | UpdateFn<T>;

/**
 * A function creating a new value for a stateful variable from
 * {@link useChamp}.
 *
 * @remarks
 * This function can also be asynchronous, either by returning a `Promise`, or
 * by using the `async` keyword.
 *
 * Any exception thrown from this function will be caught and rethrown in the
 * component. To manually handle exceptions they will have to be caught using
 * `try`-`catch` and then converted into a value.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @param oldValue - The current value of the stateful variable
 * @returns The new value, or a promise which will resolve to the new value
 * @see {@link Update}
 * @see {@link UpdateCallback}
 */
export type UpdateFn<T> = (oldValue: T) => T | Promise<T>;

/**
 * Callback which can update a stateful variable created by {@link useChamp}.
 *
 * @public
 * @category Hook
 * @typeParam T - The datatype of the stateful variable
 * @param update - The new value, or a function creating the new value
 */
export type UpdateCallback<T> = (update: Update<T>) => void;
