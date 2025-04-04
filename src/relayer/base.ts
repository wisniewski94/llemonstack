import { LogMessage } from '@/types'
import { colors } from '@cliffy/ansi/colors'
import { getCallStackInfo } from './callstack.ts'
import {
  Filter,
  FilterLike,
  FormattedValues,
  getAnsiColorFormatter,
  getConsoleSink,
  getLevelFilter,
  Logger,
  LogLevel,
  LogMessageProperties,
  LogMessageType,
  LogRecord,
  LogtapeLogger,
} from './logger.ts'

export type LogMethod = 'debug' | 'info' | 'warn' | 'error' | 'fatal'
type WithLevelType = LogLevel | 'silent' | Filter

export interface AppLogRecord extends LogRecord {
  properties: Record<string, unknown> & {
    _meta?: {
      debug?: unknown[] // Any additional arguments passed to methods that support debugging
      error?: Error | unknown
      callStack?: string // The call stack as a string, generated from `new Error().stack`
      relayerId?: string // The instance ID of the relayer that logged the message
    }
    _filter?: Filter // Optional filter to apply to the log record
  }
}

// TODO: create a proper interface to match Logtape's API
// Functions are allowed in properties but only when the message is a string or template string
export type LogMessageData = AppLogRecord['properties'] | LogMessageProperties

const silentFilter: Filter = () => false

/**
 * Relayer handles relaying log and user interaction messages.
 */
export class RelayerBase {
  // Static properties
  private static instances: Map<string, InstanceType<typeof RelayerBase>> = new Map()
  public static rootAppName: string = 'llmn'
  public static logLevel: LogLevel = 'info' // Default log level
  public static verbose: boolean = false

  // Instance properties
  protected _logger: LogtapeLogger
  protected _context: Record<string, unknown>
  protected _logLevel: LogLevel = RelayerBase.logLevel
  protected _instanceId: string

  /**
   * Get the singleton instance of the Relayer
   * @returns The singleton instance of the Relayer
   */
  public static getInstance(
    name: string | string[] = this.rootAppName,
  ) {
    const id = this.getInstanceId(name)

    // Return the existing instance if it exists
    if (this.instances.has(id)) {
      const instance = this.instances.get(id)
      if (instance) {
        return instance
      }
    }

    // Create a new instance
    const instance = new this({ name: id.split(':'), instanceId: id, defaultLevel: this.logLevel })

    // Bind all instance methods to the instance
    // This fixes issues with unbound methods throwing obfuscated errors due to this being undefined
    const prototype = Object.getPrototypeOf(instance)
    const propertyNames = Object.getOwnPropertyNames(prototype)
    for (const name of propertyNames) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name)
      if (descriptor && typeof descriptor.value === 'function' && name !== 'constructor') {
        // Safe type assertion through unknown with specific method type
        type MethodType = (...args: unknown[]) => unknown
        const instanceWithMethods = instance as unknown as Record<string, MethodType>
        const method = instanceWithMethods[name]
        if (method) {
          instanceWithMethods[name] = method.bind(instance)
        }
      }
    }

    // Save the instance to the map
    this.instances.set(id, instance)

    return instance
  }

  /**
   * Get the instance ID for the given name
   *
   * This ensures unified naming convention across subclasses.
   *
   * @param name The name of the instance
   * @returns The instance ID
   */
  private static getInstanceId(name: string | string[] | undefined): string {
    const id = (Array.isArray(name) ? name.join(':') : name || '').trim().toLowerCase()
    if (!id || id === this.rootAppName) {
      return this.rootAppName
    }
    return `${this.rootAppName}:${id}`
  }

  /**
   * Create a console sink by default
   *
   * This can be overridden by the Relayer subclass
   *
   * @returns The console sink
   */
  public static getSink() {
    return getConsoleSink({
      formatter: getAnsiColorFormatter({
        // See https://logtape.org/manual/formatters
        timestamp: 'time',
        level: 'FULL',
        levelColors: {
          debug: 'blue',
          info: 'green',
          warning: 'yellow',
          error: 'red',
          fatal: 'magenta',
        },
        category: ':',
        format: ({ timestamp: _, level, category, message, record }: FormattedValues) => {
          category = category.replace(this.rootAppName, '')
          if (record.level === 'debug') {
            return `${level}${colors.yellow(category)} ${colors.gray(message)}`
          }
          if (record.level === 'error') {
            const error = (record.properties._meta as { error?: unknown })?.error
            if (error instanceof Error && error?.message) {
              // Show message and error message if the message doesn't already include the error message
              if (message && !message.toLowerCase().includes(error.message.toLowerCase())) {
                return `${level}${colors.yellow(category)} ${colors.red(message)}: ${
                  colors.gray(error.message)
                }`
              } else {
                // Error message is same as message or message is empty
                if (!message) {
                  message = error.message
                }
                return `${level}${colors.yellow(category)} ${colors.red(message)}`
              }
            }
          }
          // From https://github.com/dahlia/logtape/blob/67a223479f3605c5fd79e7063d05e044944fc7ef/logtape/formatter.ts#L265
          // return `${timestamp ? `${timestamp} ` : ''}[${level}] ${category}: ${message}`
          return `${level}${category}: ${message}`
        },
      }),
    })
  }

  public static getFilter({ defaultLevel }: { defaultLevel?: LogLevel } = {}): Filter {
    if (defaultLevel) {
      this.logLevel = defaultLevel
    }
    return this.filter.bind(this)
  }

  /**
   * Override this in subclasses to provide a custom filter
   * @param record
   * @returns
   */
  public static filter(record: AppLogRecord): boolean {
    // Filter at the context level if set
    if (typeof record.properties._filter === 'function') {
      return record.properties._filter(record)
    }
    // Default filter
    return getLevelFilter(this.logLevel || 'info')(record)
  }

  //
  // Instance methods
  //

  constructor(
    options: {
      name?: string | string[]
      context?: Record<string, unknown>
      defaultLevel?: LogLevel
      instanceId?: string
    } = {},
  ) {
    const staticThis = this.constructor as typeof RelayerBase

    this._instanceId = options.instanceId ?? staticThis.getInstanceId(options.name)

    this._logger = Logger.getLogger(options.name || staticThis.rootAppName)

    this._logLevel = options.defaultLevel ?? staticThis.logLevel

    // Save context to auto populate context for all log messages below
    this._context = options.context || {}
  }

  public get logger() {
    return this._logger
  }

  public get instanceId() {
    return this._instanceId
  }

  public get verbose() {
    return (this.constructor as typeof RelayerBase).verbose
  }

  public getContext(): Record<string, unknown> {
    return this._context
  }

  public setContext(context: Record<string, unknown>) {
    this._context = context
    return this
  }

  public silent(silent: boolean = true): InstanceType<typeof RelayerBase> {
    if (silent) {
      // Effectively disable all log messages for any subclass that uses context._filter
      this._context._filter = silentFilter
    } else {
      delete this._context._filter
    }
    return this
  }

  public setLevel(level: LogLevel): InstanceType<typeof RelayerBase> {
    this._context._filter = getLevelFilter(level)
    return this
  }

  public setFilter(filter: FilterLike): InstanceType<typeof RelayerBase> {
    this._context._filter = filter
    return this
  }

  public getFilter(): Filter | undefined {
    return this._context._filter as Filter | undefined
  }

  /**
   * Reset the filter to the default filter
   * @returns The relayer instance
   */
  public resetLevel(): InstanceType<typeof RelayerBase> {
    // Remove the context filter to revert to the default filtering
    delete this._context._filter
    return this
  }

  /**
   * Run an async function with this relayer's context
   *
   * ```ts
   * const result = await relayer.withContext(async () => {
   *   return 'Hello, world!'
   * })
   *
   * const result = await relayer.withContext({ name: 'John' }, async () => {
   *   return 'Hello, world!'
   * })
   * ```
   *
   * @param fnOrContext The function to run or context to run with
   * @param fn The function to run
   * @returns The result of the function
   */
  public withContext<T>(
    fnOrContext: Record<string, unknown> | T | Promise<T>,
    fn?: T | Promise<T>,
  ): Promise<T> {
    if (typeof fnOrContext === 'function') {
      return Logger.runWithContext<T>(this._context, fnOrContext as () => Promise<T>)
    }
    if (typeof fn === 'function') {
      return Logger.runWithContext<T>(
        { ...this._context, ...fnOrContext },
        fn as () => Promise<T>,
      )
    }
    throw new Error('Invalid arguments, please provide a function to run')
  }

  /**
   * Run a function with a specific log level filter applied then restore the original filter
   *
   * This temporarily deletes any filters applied at the Relayer level,
   * then restores the original filter when the function completes.
   * It allows for implicit lookup of filters within the function's context.
   * Any code running within the function context will use the new filter
   * unless they specifically set their own filter.
   *
   * It's basically just syntactic sugar for...
   * ```ts
   * const filter = relayer.getLevel()
   * relayer.setLevel('debug')
   * await relayer.withContext({ _filter: getLevelFilter('debug') }, () => {
   *   relayer.debug('This should be logged')
   * })
   * relayer.resetFilter(filter)
   * ```
   *
   * @example
   * ```ts
   * relayer.setLevel('info')
   * relayer.debug('This will not output')
   *
   * const result = await relayer.withLevel('debug', () => {
   *   relayer.debug('This will output')
   * })
   *
   * relayer.debug('This will not output')
   * ```
   *
   * @param level The log level, 'silent' or a filter function
   * @param fn The function to run
   * @returns Promise that resolves to the result of the function
   */
  public withLevel = <T>(level: WithLevelType, fn: () => T | Promise<T>): Promise<T> => {
    // Save the current filter to restore after the function runs
    let promise: Promise<T> | null = null

    // Catch any errors setting up the context and filter
    try {
      const originalFilter = this._context._filter

      const filter = typeof level === 'function'
        ? level
        : level === 'silent'
        ? silentFilter
        : getLevelFilter(level)

      // Any explicit filter must be deleted before running the function.
      // Otherwise, the filter will override the implicit level filter
      // applied in the run context.
      // See https://github.com/dahlia/logtape/blob/67a223479f3605c5fd79e7063d05e044944fc7ef/logtape/logger.ts#L545
      delete this._context._filter

      // A promise is created with the new context and implicit filter level.
      // The filter is saved and looked up from AsyncLocalStorage.
      // Any function running within this context will use the new filter.
      // A better solution is
      promise = Logger.runWithContext<T>({
        ...this._context,
        _filter: filter,
      }, fn as () => Promise<T>)

      promise.then((result: T) => {
        if (originalFilter) {
          this._context._filter = originalFilter
        }
        return result
      })
    } catch (error) {
      // Send this error to a meta logger once it's implemented, for now just log it
      this.error('Unexpected error in RelayerBase.withLevel', error as Error)
    }

    // Return the promise or a resolved promise if there was an error
    return promise ?? Promise.resolve(fn())
  }

  /**
   * Run a function with a specific filter applied then restore the original filter
   *
   * Alias for withLevel(filter, fn)
   *
   * @param filter The filter to apply
   * @param fn The function to run
   * @returns Promise that resolves to the result of the function
   */
  public withFilter<T>(filter: Filter, fn: () => T | Promise<T>): Promise<T> {
    return this.withLevel(filter, fn)
  }

  //
  // Base logging methods
  //

  /**
   * Log a message to the logger
   *
   * @param level The log level
   * @param rawMessage The message to log
   * @param properties The properties to log
   */
  public log(
    level: LogLevel,
    message: LogMessageType,
    properties: AppLogRecord['properties'] | LogMessageProperties,
  ): void {
    // Explicit context is applied to the log record before being sent to the logger.
    // The Relayer's context and any data provided when this function is called
    // are merged into the log record. When the log record is processed,
    // any missing data from the explicit context will be fetched from implicit
    // AsyncLocalStorage context.

    // SOMEDAY: Add a contextLocalStore lookup of other context properties like _filter
    // to explicitly set before calling the logger method. This will ensure high priority
    // meta data like _filter is applied.

    const method = ((level === 'warning') ? 'warn' : level) as LogMethod

    if (typeof properties === 'function') {
      properties = properties()
    }

    const context = {
      ...this._context,
      ...properties,
      _meta: {
        ...(this._context._meta || {}),
        ...(properties._meta ? properties._meta : {}),
        // relayerId: this._instanceId, // categories already has the instanceID
      },
    }

    // Send the log to the logger
    // Casting to string to avoid TypeScript error
    this.logger[method](message as string, context)

    // Verbose logging
    // Outputs additional information from the structured log message
    if (this.verbose) {
      this.logVerbose(level, message, properties)
    }
  }

  /**
   * Outputs additional information from the structured log message to console
   *
   * @param level The log level
   * @param _rawMessage The message to log
   * @param properties The properties to log
   */
  public logVerbose(
    level: LogLevel,
    _message: LogMessageType,
    properties: AppLogRecord['properties'] | (() => AppLogRecord['properties']),
  ): void {
    if (typeof properties === 'function') {
      properties = properties()
    }

    // Return early if not error and there are no properties to verbose log
    if (
      level !== 'error' &&
      (!properties || !properties._meta || !properties._meta.error || !properties._meta.callStack)
    ) {
      return
    }

    // Log the error call stack if the message is an error
    if (level === 'error') {
      // Get the call stack info from the error, callStack, or create a new one
      const callStack = getCallStackInfo({
        error: properties._meta?.error as Error,
        callStack: properties._meta?.callStack,
      }).callStack

      const module = callStack[0].module
      console.error(
        `  Error occurred in ${colors.red(module ? `${module}.` : '')}${
          colors.red(callStack[0].function)
        } ${
          colors.gray(
            `line ${callStack[0].lineNumber} in ${callStack[0].fileName}${
              callStack[0].lineNumber ? `:${callStack[0].lineNumber}` : ''
            }${callStack[0].columnNumber ? `:${callStack[0].columnNumber}` : ''}`,
          )
        }`,
      )
      console.error(
        '  Call stack:',
        callStack.reverse().map((c) =>
          colors.yellow(`${c.module ? `${c.module}.` : ''}${c.function}`)
        )
          .join(' -> '),
      )
      const stackLines = (this._logLevel === 'debug') ? callStack : callStack.slice(0, 1)
      // Show the file links for the 2nd and 3rd entries in the call stack
      stackLines.forEach((c) => {
        console.error(
          colors.yellow(`  ${c.module ? `${c.module}.` : ''}${c.function}`),
          `${
            colors.gray(
              `${c.fileName}${c.lineNumber ? `:${c.lineNumber}` : ''}${
                c.columnNumber ? `:${c.columnNumber}` : ''
              }`,
            )
          }`,
        )
      })

      return
    }

    // If not error, show the call stack if it exists in the log record
    if (properties._meta?.callStack) {
      const callStack = getCallStackInfo({
        callStack: properties._meta?.callStack,
      }).callStack
      console.info(
        '  Call stack:',
        callStack.reverse().map((c) =>
          colors.yellow(`${c.module ? `${c.module}.` : ''}${c.function}`)
        )
          .join(' -> '),
      )
    }
  }

  public info(message: LogMessageType, data?: LogMessageData): void {
    this.log('info', message, data ?? {})
  }

  public warn(message: LogMessageType, data?: LogMessageData): void {
    this.log('warning', message, data ?? {})
  }

  /**
   * Log an error message
   *
   * @param message The message to log
   * @param dataOrError The data or error to log
   * @param error The error to log
   */
  public error(
    message: LogMessageType | Error,
    dataOrError: LogMessageData | Error = {},
    error?: Error,
  ): void {
    const { message: _message, context } = this._formatErrorContent(message, dataOrError, error)
    this.log('error', _message, context)
  }

  public fatal(
    message: LogMessageType | Error,
    dataOrError: LogMessageData | Error = {},
    error?: Error,
  ): void {
    const { message: _message, context } = this._formatErrorContent(message, dataOrError, error)
    this.log('fatal', _message, context)
    // Don't exit the process here, let the caller handle it
  }

  /**
   * Debug log with arbitrary arguments
   *
   * Debug uses a different API than LogTape.
   * It doesn't support passing in context. Instead passes along
   * all of the additional params in the _meta context for custom
   * log handlers to inspect.
   *
   * @param message The message to log
   * @param args The arguments to log
   */
  public debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, { _meta: { debug: args } })
  }

  /**
   * Processes an array of LogMessages, typically from TryCatchResult
   *
   * @param messages The messages to log
   * @param debug Whether to log debug messages
   */
  public logMessages(
    messages: LogMessage[],
  ): void {
    messages.forEach((message) => {
      switch (message.level) {
        case 'error':
          this.error(message.message, { error: message.error })
          break
        case 'warning':
          this.warn(message.message)
          break
        case 'debug':
          message.args !== undefined
            ? this.debug(message.message, message.args)
            : this.debug(message.message)
          break
        default:
        case 'info':
          this.info(message.message)
          break
      }
    })
  }

  //
  // Helper methods
  //

  /**
   * Format a message or error into a loggable message and context
   *
   * Used to process calls to error or fatal methods.
   *
   * @param messageOrError The message or error to format
   * @param dataOrError The data or error to format
   * @param error The error to format
   * @returns The formatted message and context
   */
  protected _formatErrorContent(
    messageOrError: LogMessageType | Error,
    dataOrError: LogMessageData | Error = {},
    error?: Error,
  ): { message: LogMessageType; context: AppLogRecord['properties'] } {
    if (messageOrError instanceof Error) {
      return {
        message: messageOrError.message || String(messageOrError),
        context: {
          ...dataOrError,
          _meta: {
            error: messageOrError,
          },
        },
      }
    }

    let data = {}
    if (dataOrError instanceof Error) {
      error = dataOrError
    } else {
      data = dataOrError
    }
    return {
      message: messageOrError,
      context: {
        ...data,
        ...(error ? { _meta: { error } } : {}),
      } as AppLogRecord['properties'],
    }
  }
}
