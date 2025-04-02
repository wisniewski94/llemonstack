import { LogMessage } from '@/types'
import {
  Filter,
  FilterLike,
  getAnsiColorFormatter,
  getConsoleSink,
  getLevelFilter,
  Logger,
  LogLevel,
  LogRecord,
  LogtapeLogger,
} from './logger.ts'
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
    const instance = new this({ name, instanceId: id })

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
        timestamp: 'time',
        level: 'FULL',
      }),
    })
  }

  public static getFilter({ defaultLevel }: { defaultLevel?: LogLevel } = {}): Filter {
    if (defaultLevel) {
      this.logLevel = defaultLevel
    }
    return this.filter
  }

  /**
   * Override this in subclasses to provide a custom filter
   * @param record
   * @returns
   */
  public static filter(_record: LogRecord): boolean {
    return true
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
  public async withContext<T>(
    fnOrContext: Record<string, unknown> | (() => Promise<T>),
    fn?: () => Promise<T>,
  ): Promise<T> {
    if (typeof fnOrContext === 'function') {
      return await Logger.runWithContext(this._context, fnOrContext)
    }
    if (typeof fn === 'function') {
      return await Logger.runWithContext({ ...this._context, ...fnOrContext }, fn)
    }
    throw new Error('Invalid arguments, please provide a function to run')
  }

  //
  // Base logging methods
  //

  public info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, { ...this._context, ...data })
  }

  public warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(message, { ...this._context, ...data })
  }

  public error(message: string, data?: Record<string, unknown>): void {
    this.logger.error(message, { ...this._context, ...data })
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
    this.logger.debug(message, { ...this._context, _meta: { debug: args } })
  }

  public fatal(message: string, data?: Record<string, unknown>): void {
    this.logger.fatal(message, { ...this._context, ...data })
    // Deno.exit(1)
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
