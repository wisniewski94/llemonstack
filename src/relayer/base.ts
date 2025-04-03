import { LogMessage } from '@/types'
import { colors } from '@cliffy/ansi/colors'
import {
  Filter,
  FilterLike,
  FormattedValues,
  getAnsiColorFormatter,
  getConsoleSink,
  getLevelFilter,
  Logger,
  LogLevel,
  LogRecord,
  LogtapeLogger,
} from './logger.ts'

export type LogMethod = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface AppLogRecord extends LogRecord {
  properties: Record<string, unknown> & {
    _meta?: {
      debug?: unknown[] // Any additional arguments passed to methods that support debugging
      error?: unknown
      relayerId?: string // The instance ID of the relayer that logged the message
    }
  }
}

/**
 * Relayer handles relaying log and user interaction messages.
 */
export class RelayerBase {
  // Static properties
  private static instances: Map<string, InstanceType<typeof RelayerBase>> = new Map()
  public static rootAppName: string = 'llmn'
  public static logLevel: LogLevel = 'info' // Default log level

  // Instance properties
  protected _logger: LogtapeLogger
  protected _context: Record<string, unknown>
  protected _logLevel: LogLevel = RelayerBase.logLevel
  protected _instanceId: string

  /**
   * Get the singleton instance of the Relayer
   * @returns The singleton instance of the Relayer
   */
  public static getInstance<T extends RelayerBase>(
    name: string | string[] = this.rootAppName,
  ): T {
    const id = this.getInstanceId(name)

    // Return the existing instance if it exists
    if (this.instances.has(id)) {
      const instance = this.instances.get(id)
      if (instance) {
        return instance as T
      }
    }

    // Create a new instance
    const instance = new this({ name: id.split(':'), instanceId: id })

    // Save the instance to the map
    this.instances.set(id, instance)

    return instance as T
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
        format: ({ timestamp, level, category, message, record }: FormattedValues) => {
          // console.log('???? values', values)
          if (record.level === 'debug') {
            return `${level}${colors.yellow(category.replace(this.rootAppName, ''))} ${
              colors.gray(message)
            }`
          }
          // From https://github.com/dahlia/logtape/blob/67a223479f3605c5fd79e7063d05e044944fc7ef/logtape/formatter.ts#L265
          return `${timestamp ? `${timestamp} ` : ''}[${level}] ${category}: ${message}`
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
  public static filter(record: LogRecord): boolean {
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

    // Save context to auto populate context for all log messages below
    this._context = options.context || {}
  }

  public get logger() {
    return this._logger
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
      this._context._filter = () => false
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
   * @param level The log level to run with
   * @param fn The function to run
   * @returns Promise that resolves to the result of the function
   */
  public withLevel<T>(level: LogLevel, fn: T | Promise<T>): Promise<T> {
    // Save the current filter to restore after the function runs
    const filter = this._context._filter

    // Any explicit filter must be deleted before running the function.
    // Otherwise, the filter will override the implicit level filter
    // applied in the run context.
    // See https://github.com/dahlia/logtape/blob/67a223479f3605c5fd79e7063d05e044944fc7ef/logtape/logger.ts#L545
    delete this._context._filter

    // A promise is created with the new context and implicit filter level.
    // The filter is saved and looked up from AsyncLocalStorage.
    // Any function running within this context will use the new filter.
    // A better solution is
    const promise = Logger.runWithContext<T>({
      ...this._context,
      test: 'some implicit context',
      _filter: getLevelFilter(level),
    }, fn as () => Promise<T>)

    promise.then((result: T) => {
      if (filter) {
        this._context._filter = filter
      }
      return result
    })
    return promise
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
    rawMessage: string,
    properties: AppLogRecord['properties'] | (() => AppLogRecord['properties']),
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

    const context = {
      ...this._context,
      ...properties,
      _meta: {
        ...(this._context._meta || {}),
        ...(typeof properties === 'function' ? properties()._meta : properties._meta || {}),
        // relayerId: this._instanceId, // categories already has the instanceID
      },
    }

    this.logger[method](rawMessage, context)
  }

  public info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data ?? {})
  }

  public warn(message: string, data?: Record<string, unknown>): void {
    this.log('warning', message, data ?? {})
  }

  public error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data ?? {})
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

  public fatal(message: string, data?: Record<string, unknown>): void {
    this.log('fatal', message, data ?? {})
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
}
