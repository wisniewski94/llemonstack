/**
 * TryCatch library
 *
 * Inspired by https://gist.github.com/t3dotgg/a486c4ae66d32bf17c09c73609dacc5b
 */

import type { LogMessage } from '@/types'

/**
 * TryCatchResult class
 *
 * A result of a try-catch operation. Supports pushing log messages to the result.
 *
 * @template T - The type of the data
 * @template E - The type of the error
 */
export class TryCatchResult<T, E = Error> implements ITryCatchResult<T, E> {
  /**
   * Creates a TryCatchResultWithLog from a standard TryCatchResult
   * @param result - The TryCatchResult to convert
   * @returns A new TryCatchResultWithLog instance
   */
  static from<T, E = Error>(result: TryCatchResultBase<T, E>): TryCatchResult<T, E> {
    return new TryCatchResult<T, E>(result)
  }

  /**
   * Collects a list of TryCatchResults with combined messages and errors
   *
   * Useful for collecting results from multiple tryCatch calls. Typically from a Promise.all call.
   *
   * // TODO: verify this example is correct
   * @example
   * ```ts
   * const results = await Promise.all(services.tryCatchMap<boolean>((service) => service.prepareEnv()))
   * const collectedResults = TryCatchResult.collect<boolean>(results)
   * ```
   *
   * The data of the returned TryCatchResult is an array of the data from the TryCatchResults in the list.
   * The success of the returned TryCatchResult is true if all TryCatchResults in the list are successful.
   * The messages of the returned TryCatchResult are all the messages from the TryCatchResults in the list.
   * The errors of the returned TryCatchResult are all the errors from the TryCatchResults in the list.
   * The error of the returned TryCatchResult is the first error found from the TryCatchResults in the list.
   *
   * @param results - The list of TryCatchResults to collect
   * @returns A new TryCatchResult with the data set to null and the success set to true
   */
  // TODO: write tests for this
  static collect<T, E = Error>(results: TryCatchResult<T, E>[]): TryCatchResult<(T | null)[], E> {
    const result = new TryCatchResult<(T | null)[], E>({ data: [], error: null, success: true })
    results.forEach((r) => {
      result.addMessages(r.messages)
      // TODO: modify this to ensure errors length matches data length if data is an array
      result.addErrors(r.errors)
      if (!Array.isArray(result.data)) {
        result.data = []
      }
      result.data.push(r.data)
    })
    result.success = result.errors.length === 0
    return result
  }

  data: T | null
  success: boolean
  messages: LogMessage[] = []

  private _errors: E[] = []

  constructor(result: TryCatchResultBase<T, E>) {
    this.data = result.data
    this.error = result.error
    this.success = result.success
    this.messages = result.messages || []
  }

  toString(): string {
    if (!this.success && this.error) {
      const err = this.error as unknown as { stderr?: string; message?: string }
      return err?.stderr || err?.message || 'Unknown error'
    }
    return this.data?.toString() || 'Unknown'
  }

  set error(error: E | null) {
    error && this._errors.push(error)
    this.success = !error
  }

  get error(): E | null {
    return this._errors[0] || null
  }

  get errors(): E[] {
    return this._errors
  }

  addErrors(errors: E | E[]): void {
    const errs = Array.isArray(errors) ? errors : [errors]
    if (errs.length === 0 || !errs[0]) {
      // No errors to add, don't set success below
      return
    }
    this._errors.push(...errs)
    this.success = false
  }

  /**
   * Adds a message to the result
   * @param level - The level of the message (error, warning, info)
   * @param message - The message text
   * @returns this instance for chaining
   */
  addMessage(
    level: LogMessage['level'],
    message: string,
    { error, args }: { error?: Error | unknown; args?: unknown } = {},
  ): TryCatchResult<T, E> {
    this.messages.push({ level, message, error, args })
    return this
  }

  addMessages(...messages: LogMessage[] | LogMessage[][]): TryCatchResult<T, E> {
    this.messages.push(...messages.flat())
    return this
  }

  /**
   * Push messages to the beginning of the message array
   *
   * Useful for adding previous messages to the front of a final tryCatch call.
   * @param messages - The messages to push
   * @returns this instance for chaining
   *
   * @example
   * result.unshiftMessages(otherResult.messages, anotherResult.messages)
   *
   * @example
   * return await tryCatch(this.loadEnv({ reload, expand }))
   *   .unshiftMessages(previousResult.messages, anotherResult.messages)
   */
  unshiftMessages(...messages: LogMessage[] | LogMessage[][]): TryCatchResult<T, E> {
    this.messages.unshift(...messages.flat())
    return this
  }

  /**
   * Collects additional TryCatchResults by adding their messages and errors
   *
   * Preserves the original results data.
   *
   * @param results - The list of TryCatchResults to collect
   * @returns A new TryCatchResult with the data set to null and the success set to true
   */
  collect(results: TryCatchResult<T, E>[]): TryCatchResult<T, E> {
    results.forEach((r) => {
      this.addMessages(r.messages)
      // TODO: modify this to ensure errors length matches data length if data is an array
      this.addErrors(r.errors)
    })
    this.success = this.errors.length === 0
    return this
  }
}

/**
 * Custom error class for TryCatch results
 */
export class TryCatchError extends Error {
  public originalError?: Error

  constructor(message: string, originalError?: Error) {
    super(message)

    // Set the name of your custom error
    this.name = this.constructor.name

    // Preserve the original error
    this.originalError = originalError

    // Capture the stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }

    // Attach the original stack if there was an original error
    if (originalError && originalError.stack) {
      this.stack = `${this.stack}\n\nCaused by: ${originalError.stack}`
    }
  }
}

export type Success<T> = {
  data: T
  error: null
  success: true
  messages?: LogMessage[]
}

export type Failure<E, T> = {
  data: null | T
  error: E
  success: false
  messages?: LogMessage[]
}

export type TryCatchResultBase<T, E = Error> = Success<T> | Failure<E, T>

interface ITryCatchResult<T, E> {
  data: T | null
  error: E | null
  success: boolean
  messages?: LogMessage[]
}

/**
 * Wraps a promise and returns a TryCatchResult object
 * @param promise - The promise to wrap
 * @returns A TryCatchResult object with the result of the promise
 */
export async function tryCatch<T, E = Error>(
  promise: Promise<T> | T,
): Promise<TryCatchResult<T, E>> {
  try {
    const data = await (promise instanceof Promise ? promise : Promise.resolve(promise))
    return new TryCatchResult<T, E>({ data, error: null, success: true })
  } catch (error) {
    return new TryCatchResult<T, E>({ data: null, error: error as E, success: false })
  }
}

/**
 * Wraps a promise and returns a boolean indicating success or failure
 *
 * Primarily used for async operations that don't return a value.
 *
 * @param promise - The promise to wrap
 * @returns A TryCatchResult object with the result of the promise
 */
export async function tryCatchBoolean<E = Error>(
  promise: Promise<void>,
): Promise<TryCatchResult<boolean, E>> {
  try {
    await promise
    return new TryCatchResult<boolean, E>({ data: true, error: null, success: true })
  } catch (error) {
    return new TryCatchResult<boolean, E>({ data: false, error: error as E, success: false })
  }
}

/**
 * Executes list of functions in parallel in a tryCatch context and collects the results
 *
 * Functions can be async promises or regular functions.
 *
 * @param promises - The functions to wrap
 * @returns A TryCatchResult object with the results of the promises
 */
export async function tryCatchAll<T, E = Error>(
  promises: (Promise<T> | T)[],
): Promise<TryCatchResult<(T | null)[], E>> {
  return TryCatchResult.collect<T, E>(
    await Promise.all(promises.map((p) => tryCatch<T, E>(p))),
  )
}

/**
 * Wraps a TryCatchResult object and returns a new TryCatchResult object with the error message updated
 *
 * @param newMessage - The new error message
 * @param result - The TryCatchResult object to wrap
 * @returns A new TryCatchResult object with the error message updated
 */
export function failure<T, E extends Error = Error>(
  newMessage: string,
  result: TryCatchResult<unknown, E> | Failure<E, T>,
  data?: T,
): TryCatchResult<T, E> {
  if (!(result instanceof TryCatchResult)) {
    result = TryCatchResult.from<T, E>(result)
  }
  if (data) {
    result.data = data
  }
  if (result.error) {
    // Preserve the original error and add a message
    result.addMessage('error', result.error.message, { error: result.error })
    result.addMessage('error', newMessage)
  } else {
    // Create a new error with the original error
    result.error = new TryCatchError(newMessage, undefined) as E
  }
  return result as TryCatchResult<T, E>
}

/**
 * Returns a new TryCatchResult object with the data set and success set to true
 * @param data - The data to set
 * @returns A new TryCatchResult
 */
export function success<T>(
  data: T,
  infoMessage?: string,
): TryCatchResult<T, Error> {
  const results = new TryCatchResult<T, Error>({ data, error: null, success: true })
  if (infoMessage) {
    results.addMessage('info', infoMessage)
  }
  return results
}
