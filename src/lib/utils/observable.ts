/**
 * Observable
 *
 * Simple implementation of the Observable pattern
 * From https://github.com/therapyjs/observable
 *
 * ```typescript
 * // Basic usage
 * const obs = new Observable(0);
 * obs.listen((newVal: number) => {
 *   console.log(newVal); // updated value
 * });
 *
 * obs.value = 10;
 * ```
 *
 * ```typescript
 * const state = new ObservableStruct({ foo: 10, bar: "hello" });
 *
 * state.listen((update) => {
 *   if (!update) return; // update will be null if struct is cleared
 *
 *   //  {
 *   //    key: "bar",
 *   //    oldValue: "hello",
 *   //    newValue: "world",
 *   //  }
 *
 *   console.log(update);
 * });
 *
 * state.set("bar", "world");
 *
 * state.set("foo", "goodbye"); // TS Error, foo's default value was not a string
 *
 * // Generics can be used for finer control of the type
 * new ObservableStruct<{ foo: string | number }>({ foo: "goodbye" });
 * ```
 */

type Nullish<T> = T | undefined | null

/**
 * Default callback type for listeners by Observable-type classes
 */
export type Callback<T> = (arg: T) => void

/**
 * @therapy/observable is an implementation of the observer pattern for simple state management. It has zero-dependencies
 * and is lightwight, utilizing basic classes.
 *
 * @module
 */

/**
 * Represents an observable value that can be listened to for changes.
 * Implements the Observer pattern, allowing multiple listeners to react to value updates.
 *
 * @template T - The type of the observable value.
 */
export class Observable<T> {
  /**
   * Collection of listeners on this observable
   */
  listeners: Set<Callback<T>> = new Set<Callback<T>>()

  #value: T

  /**
   * Retrieves the current value of the observable.
   *
   * @returns {T} The current value.
   */
  get value(): T {
    return this.#value as T
  }

  /**
   * Sets a new value for the observable and notifies all registered listeners of the change.
   *
   * @param {T} newValue - The new value to set.
   */
  set value(newValue: T) {
    this.#value = newValue
    this.listeners.forEach((listener) => listener(this.#value))
  }

  /**
   * Creates a new Observable instance with an initial default value.
   *
   * @param {T} defaultValue - The initial value of the observable.
   */
  constructor(defaultValue: T) {
    this.#value = defaultValue
  }

  /**
   * Registers a new listener callback to be invoked whenever the observable's value changes.
   *
   * @param {Callback<T>} callback - The function to be called on value changes.
   */
  listen(callback: Callback<T>) {
    this.listeners.add(callback)
  }
  /**
   * Unregisters a previously registered listener callback.
   *
   * @param {Callback<T>} callback - The function to be removed from the listeners.
   */
  unlisten(callback: Callback<T>) {
    this.listeners.delete(callback)
  }

  /**
   * Removes all registered listener callbacks and cleans up the observable.
   * After calling dispose, the observable will no longer notify any listeners.
   */
  dispose() {
    this.listeners.forEach((listener) => this.unlisten(listener))
  }
}

/**
 * Represents a value change in the ObservableMap.
 *
 * @template K - The type of keys in the map.
 * @template T - The type of values in the map.
 */
export type ObservableMapValue<K, T> = Nullish<{
  /** The key that was added, updated, or deleted. */
  key: K
  /** The previous value associated with the key, if any. */
  oldValue: Nullish<T>
  /** The new value associated with the key, or null if the key was deleted. */
  newValue: Nullish<T>
}>

/**
 * An observable version of the native JavaScript Map.
 * Extends the Map class to allow listeners to react to changes such as additions, updates, and deletions of key-value pairs.
 *
 * @template K - The type of keys in the map.
 * @template T - The type of values in the map.
 */
export class ObservableMap<K, T> extends Map<K, T> {
  #observer = new Observable<ObservableMapValue<K, T>>(null)

  /**
   * Creates a new ObservableMap instance.
   *
   * @param {Array<[K, T]> | null} [values] - An optional array of key-value pairs to initialize the map.
   */
  constructor(values?: [K, T][] | null) {
    super()

    if (values) {
      values.forEach((pair) => {
        const [key, value] = pair

        super.set(key, value)
      })
    }
  }

  /**
   * Sets the value for a key in the map and notifies listeners about the change.
   *
   * @param {K} key - The key of the element to add or update.
   * @param {T} value - The value to set for the specified key.
   * @returns {this} The ObservableMap instance.
   */
  override set(key: K, value: T): this {
    const oldValue = this.get(key)

    const output = super.set(key, value)
    this.#observer.value = { key, oldValue, newValue: value }

    return output
  }

  /**
   * Deletes a key-value pair from the map and notifies listeners about the deletion.
   *
   * @param {K} key - The key of the element to remove.
   * @returns {boolean} True if an element in the Map existed and has been removed, or false if the element does not exist.
   */
  override delete(key: K): boolean {
    const oldValue = this.get(key)

    const output = super.delete(key)
    this.#observer.value = { key, oldValue, newValue: null }

    return output
  }

  /**
   * Removes all key-value pairs from the map and notifies listeners that the map has been cleared.
   */
  override clear() {
    this.#observer.value = null
    super.clear()
    return
  }

  /**
   * Registers a listener callback to be invoked whenever the map changes.
   *
   * @param {Callback<ObservableMapValue<K, T>>} callback - The function to be called on map changes.
   */
  listen(callback: Callback<ObservableMapValue<K, T>>) {
    this.#observer.listen(callback)
  }

  /**
   * Unregisters a previously registered listener callback.
   *
   * @param {Callback<ObservableMapValue<K, T>>} callback - The function to be removed from the listeners.
   */
  unlisten(callback: Callback<ObservableMapValue<K, T>>) {
    this.#observer.unlisten(callback)
  }

  /**
   * Removes all registered listener callbacks and cleans up the ObservableMap.
   * After calling dispose, the ObservableMap will no longer notify any listeners.
   */
  dispose() {
    this.#observer.dispose()
  }
}

/**
 * Represents a value change in the ObservableSet.
 *
 * @template T - The type of elements in the set.
 */
export type ObservableSetValue<T> = Nullish<{
  /** The index at which the change occurred. */
  idx: number
  /** The previous value before the change, if any. */
  oldValue: Nullish<T>
  /** The new value after the change, or null if the value was removed. */
  newValue: Nullish<T>
}>

/**
 * An observable version of the native JavaScript Set.
 * Extends the Set class to allow listeners to react to changes such as additions and deletions of elements.
 *
 * @template T - The type of elements in the set.
 */
export class ObservableSet<T> extends Set<T> {
  #observer = new Observable<ObservableSetValue<T>>(null)

  /**
   * Creates a new ObservableSet instance.
   *
   * @param {T[] | null} [values] - An optional array of values to initialize the set.
   */
  constructor(values?: T[] | null) {
    super()

    if (values) {
      values.forEach((val) => {
        super.add(val)
      })
    }
  }

  #toArr(): T[] {
    return [...this.values()]
  }

  /**
   * Finds the index and value of a specified element in the set.
   *
   * @param {T} search - The element to search for in the set.
   * @returns {{ idx: number; val: Nullish<T> }} An object containing the index and value of the found element, if found.
   */
  find(search: T): { idx: number; val: Nullish<T> } {
    const output: { idx: number; val: Nullish<T> } = {
      idx: -1,
      val: null,
    }

    const val = this.#toArr().find((val, i) => {
      output.idx = i
      return val === search
    })

    if (val) output.val = val
    else output.idx++ // if not found, add 1 to account for new addition

    return output
  }

  /**
   * Adds a new element to the set and notifies listeners about the addition.
   *
   * @param {T} value - The value to add to the set.
   * @returns {this} The ObservableSet instance.
   */
  override add(value: T): this {
    const oldValue = this.find(value)

    const output = super.add(value)
    this.#observer.value = {
      idx: oldValue.idx,
      oldValue: oldValue.val,
      newValue: value,
    }

    return output
  }

  /**
   * Retrieves the element at the specified index in the set.
   *
   * @param {number} index - The index of the element to retrieve.
   * @returns {Nullish<T>} The element at the specified index, or null if the index is out of bounds.
   */
  get(index: number): Nullish<T> {
    return this.#toArr()[index]
  }

  /**
   * Removes an element from the set and notifies listeners about the removal.
   *
   * @param {T} value - The value to remove from the set.
   * @returns {boolean} True if the element was successfully removed, or false if the element was not found.
   */
  override delete(value: T): boolean {
    const oldValue = this.find(value)

    const output = super.delete(value)
    this.#observer.value = {
      idx: oldValue.idx,
      oldValue: oldValue.val,
      newValue: null,
    }

    return output
  }

  /**
   * Removes all elements from the set and notifies listeners that the set has been cleared.
   */
  override clear() {
    this.#observer.value = null
    super.clear()
    return
  }

  /**
   * Registers a listener callback to be invoked whenever the set changes.
   *
   * @param {Callback<ObservableSetValue<T>>} callback - The function to be called on set changes.
   */
  listen(callback: Callback<ObservableSetValue<T>>) {
    this.#observer.listen(callback)
  }
  /**
   * Unregisters a previously registered listener callback.
   *
   * @param {Callback<ObservableSetValue<T>>} callback - The function to be removed from the listeners.
   */
  unlisten(callback: Callback<ObservableSetValue<T>>) {
    this.#observer.unlisten(callback)
  }
  /**
   * Removes all registered listener callbacks and cleans up the ObservableSet.
   * After calling dispose, the ObservableSet will no longer notify any listeners about changes.
   */
  dispose() {
    this.#observer.dispose()
  }
}

type ValidObservables =
  | Observable<any>
  | ObservableMap<any, any>
  | ObservableSet<any>
type Dispose = () => void
/**
 * Registers a callback function to multiple observables and provides a dispose function to unregister the callback.
 *
 * @param {() => void} callback - The function to be invoked whenever any of the observables change.
 * @param {ValidObservables[]} observableDeps - An array of observables to observe. Each observable must implement the listen and unlisten methods.
 * @returns {Dispose} A dispose function that, when called, will unregister the callback from all provided observables.
 *
 * @example
 * ```typescript
 * // Assume Observable, ObservableMap, and ObservableSet are defined and imported
 * type Dispose = () => void;
 * type ValidObservables = Observable<any> | ObservableMap<any, any> | ObservableSet<any>;
 *
 * const observable1 = new Observable<number>(0);
 * const observable2 = new ObservableMap<string, number>();
 *
 * const callback = () => {
 *   console.log('An observable has changed!');
 * };
 *
 * // Register the callback to both observables
 * const dispose = observe(callback, [observable1, observable2]);
 *
 * // Later, to unregister the callback
 * dispose();
 * ```
 */
export const observe = (
  callback: () => void,
  observableDeps: ValidObservables[],
): Dispose => {
  observableDeps.forEach((observable) => observable.listen(callback))

  return () => observableDeps.forEach((observable) => observable.unlisten(callback))
}

type OStruct = Record<string, any>
/**
 * Represents a structured observable object with strongly-typed properties, based on the initial value.
 *
 * @template T - The type of the structured object.
 */
export class ObservableStruct<T extends OStruct> extends ObservableMap<
  string,
  any
> {
  /**
   * Creates a new ObservableStruct instance with a default state.
   *
   * @param {T} defaultState - The initial state of the observable struct. Each key-value pair in `defaultState` is added to the map.
   */
  constructor(defaultState: T) {
    super(Object.entries(defaultState))
  }

  /**
   * Sets the value for a specific key in the struct and notifies listeners about the change.
   *
   * @template K - The keys of the struct `T`.
   * @param {K} key - The key of the property to set.
   * @param {T[K]} value - The new value to assign to the specified key.
   * @returns {this} The ObservableStruct instance.
   */
  override set<K extends keyof T>(key: K, value: T[K]): this {
    return super.set(key as string, value)
  }

  /**
   * Deletes a property from the struct and notifies listeners about the removal.
   *
   * @template K - The keys of the struct `T`.
   * @param {K} key - The key of the property to delete.
   * @returns {boolean} True if the property was successfully deleted, or false if the property does not exist.
   */
  override delete<K extends keyof T>(key: K): boolean {
    return super.delete(key as string)
  }

  /**
   * Retrieves the value of a specific property in the struct.
   *
   * @template K - The keys of the struct `T`.
   * @param {K} key - The key of the property to retrieve.
   * @returns {T[K]} The value associated with the specified key.
   */
  override get<K extends keyof T>(key: K): T[K] {
    return super.get(key as string) as T[K]
  }

  /**
   * Checks if a specific property exists in the struct.
   *
   * @template K - The keys of the struct `T`.
   * @param {K} key - The key of the property to check.
   * @returns {boolean} True if the property exists, otherwise false.
   */
  override has<K extends keyof T>(key: K): boolean {
    return super.has(key as string)
  }

  /**
   * Registers a listener callback to be invoked whenever a specific property in the struct changes.
   *
   * @template K - The keys of the struct `T`.
   * @param {Callback<ObservableMapValue<K, T[K]>>} callback - The function to be called on property changes. Receives an `ObservableMapValue` detailing the change.
   */
  override listen<K extends keyof T>(
    callback: Callback<ObservableMapValue<K, T[K]>>,
  ) {
    super.listen(callback as Callback<ObservableMapValue<string, unknown>>)
  }
}
