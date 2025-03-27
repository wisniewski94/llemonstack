/**
 * TryCatch library
 *
 * Inspired by https://gist.github.com/t3dotgg/a486c4ae66d32bf17c09c73609dacc5b
 */

import type { LogMessage } from './types.d.ts'

/**
 * TryCatchResult class
 *
 * A result of a try-catch operation. Supports pushing log messages to the result.
 *
 * @template T - The type of the data
 * @template E - The type of the error
 */
export class TryCatchResult<T, E = Error> implements ITryCatchResult<T, E> {
  data: T | null
  _error: E | null
  success: boolean
  messages: LogMessage[] = []

  constructor(result: TryCatchResultBase<T, E>) {
    this.data = result.data
    this._error = result.error
    this.success = result.success
    this.messages = result.messages || []
  }

  set error(error: E | null) {
    this._error = error
    this.success = !error
  }

  get error(): E | null {
    return this._error
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

  /**
   * Creates a TryCatchResultWithLog from a standard TryCatchResult
   * @param result - The TryCatchResult to convert
   * @returns A new TryCatchResultWithLog instance
   */
  static from<T, E = Error>(result: TryCatchResultBase<T, E>): TryCatchResult<T, E> {
    return new TryCatchResult<T, E>(result)
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
  promise: Promise<T>,
): Promise<TryCatchResult<T, E>> {
  try {
    const data = await promise
    return new TryCatchResult<T, E>({ data, error: null, success: true })
  } catch (error) {
    return new TryCatchResult<T, E>({ data: null, error: error as E, success: false })
  }
}

/**
 * Wraps a promise and returns a boolean indicating success or failure
 * Primarily used for async operations that don't return a value.
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
 * Wraps a TryCatchResult object and returns a new TryCatchResult object with the error message updated
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
