/**
 * @module konbini
 * A simple single-like reactive store that can be used in Svelte
 * @example
 * ```ts
 * import { konbini, computed, from } from "@in5net/konbini";
 *
 * const count = konbini(0);
 * const doubled = computed(() => count() * 2);
 * const tripled = from(store => {
 *   store.subscribe(value => store(value * 3));
 * }, 0);
 */
// This is mainly the observables in https://github.com/jbreckmckye/trkl with the Svelte store contract and a few new functions

/** A function to be called when the store's value changes */
export type Subscriber<T> = (newValue: T, oldValue?: T) => any;
/** Represents the {@link Store.subscribe} method, which returns a function to stop listening for changes */
export type Subscribe<T> = (subscriber: Subscriber<T>) => () => void;

/** A store that can be subscribed to */
export interface Store<T> {
  /** Get the value of the store */
  (): T;
  /** Set the value of the store based on the previous value */
  (updater: (oldValue: T) => T): T;
  /** Set the value of the store */
  (newValue: T): T;
  /** Set the value of the store */
  set(newValue: T): T;
  /** Set the value of the store based on the previous value */
  update(updater: (oldValue: T) => T): T;
  /** Listen for changes to the store's value. This returns a function that can be called to stop listening for changes */
  subscribe: Subscribe<T>;
  /** Stop listening for changes to the store's value */
  unsubscribe(subscriber: Subscriber<any>): void;
}

const computedStack: (() => void)[] = [];

/**
 * Create a new store
 *
 * @param value The initial value of the store
 * @returns A store
 *
 * @example
 * ```ts
 * const count = konbini(0);
 * count() // 0
 * count(2);
 * count() // 2
 * count(value => value + 1);
 * count() // 3
 * ```
 */
export function konbini<T>(value?: T): Store<T> {
  const subscribers = new Set<Subscriber<T>>();

  function read(): T {
    const runningComputation = computedStack.at(-1);
    if (runningComputation) subscribers.add(runningComputation);
    return value as T;
  }

  // @ts-ignore the type is quite complex since the number and value of the arguments can vary
  const store: Store<T> = (...args) => {
    if (!args.length) return read();

    const newValue: T =
      typeof args[0] === "function" ? args[0](read()) : args[0];
    if (newValue === value) return;

    const oldValue = value;
    value = newValue;

    subscribers.forEach(subscriber => subscriber(newValue, oldValue));
  };
  store.set = value => store(value);
  store.update = updater => {
    const newValue = updater(store());
    return store(newValue);
  };
  store.subscribe = subscriber => {
    subscribers.add(subscriber);
    subscriber(value as T);
    return () => subscribers.delete(subscriber);
  };
  store.unsubscribe = subscriber => subscribers.delete(subscriber);

  return store;
}

/**
 * Creates a derived store
 *
 * @param executor A function that returns the value of the store
 * @returns A store
 *
 * @example
 * ```ts
 * const count = konbini(0);
 * const doubled = derived(() => count() * 2);
 * count(2);
 * doubled() // 4
 * ```
 */
export function computed<T>(executor: () => T): Store<T> {
  const store = konbini<T>();

  function computation() {
    if (computedStack.includes(computation))
      throw new Error("Circular computation");

    computedStack.push(computation);
    let result: T;
    let error: unknown;
    try {
      result = executor();
    } catch (e) {
      error = e;
    }
    computedStack.pop();
    if (error) throw error;
    // @ts-ignore the type here is correct
    store(result);
  }
  computation();

  return store;
}

/**
 * Creates a store where its value is derived from a function
 *
 * @param executor A function that takes a store and returns a value
 * @param initialValue The initial value of the store
 * @returns A store
 *
 * @example A store that fetches the status of an API
 * ```ts
 * const status = from(async store => {
 *   const response = await fetch("https://api.example.com/status");
 *   store(await response.json());
 * }, { online: false });
 * ```
 */
export function from<T>(
  executor: (store: Store<T>) => any,
  initialValue?: T,
): Store<T> {
  const store = konbini(initialValue);
  executor(store);
  return store;
}
