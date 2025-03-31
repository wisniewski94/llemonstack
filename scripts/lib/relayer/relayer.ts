import { LoggerConfig, LogLevel, LogtapeLogger } from './logger.ts'
import { InterfaceRelayer } from './ui/interface.ts'
export type { LogLevel }

/**
 * Relayer handles relaying log and user interaction messages.
 */
export class Relayer {
  private static initialized: boolean = false
  private static instances: Map<string, Relayer> = new Map()
  public static rootAppName: string = 'llmn'

  protected _logger: LogtapeLogger
  protected _context: Record<string, unknown>

  private _logLevel: LogLevel = 'info'
  private _instanceId: string

  public _interface: InterfaceRelayer

  /**
   * Initialize the Relayer system
   *
   * This needs to be called once before getInstance()
   */
  public static async initialize({ reset = false }: { reset?: boolean } = {}): Promise<boolean> {
    if (this.initialized && !reset) {
      return true
    }

    LoggerConfig.appName = this.rootAppName

    // Create and configure Logtape logger
    await LoggerConfig.initLogger(this.rootAppName, {
      // TODO: get log level from env
      defaultLevel: 'debug',
      reset,
    })

    this.initialized = true

    return true
  }

  /**
   * Get the singleton instance of the Relayer
   * @returns The singleton instance of the Relayer
   */
  public static getInstance(
    name: string | string[] = this.rootAppName,
  ): Relayer {
    const id = this.getInstanceId(name)
    if (this.instances.has(id)) {
      const instance = this.instances.get(id)
      if (instance) {
        return instance
      }
    }

    this.instances.set(id, new Relayer({ name }))

    return this.instances.get(id) as Relayer
  }

  private static getInstanceId(name: string | string[] | undefined): string {
    const id = (Array.isArray(name) ? name.join(':') : name || '').trim().toLowerCase()
    if (!id || id === this.rootAppName) {
      return this.rootAppName
    }
    return `${this.rootAppName}:${id}`
  }

  constructor(
    options: {
      name?: string | string[]
      context?: Record<string, unknown>
    } = {},
  ) {
    this._instanceId = Relayer.getInstanceId(options.name)

    this._logger = LoggerConfig.getLogger(options.name || Relayer.rootAppName)

    // Save context to auto populate context for all log messages below
    this._context = options.context || {}

    this._interface = new InterfaceRelayer({ context: this._context })
  }

  get show() {
    return this._interface
  }

  public getContext(): Record<string, unknown> {
    return this._context
  }

  public setContext(context: Record<string, unknown>) {
    this._context = context
    return this
  }

  /**
   * Creates a new Relayer with combined context
   * @param additionalContext Context to add to the existing context
   * @returns A new Relayer instance with the combined context
   */
  public withContext(additionalContext: Record<string, unknown>): Relayer {
    // Combine this Relayer's context with additional context
    const newContext = { ...this._context, ...additionalContext }

    return new Relayer({
      name: this._logger.category[1],
      context: newContext,
    })
  }

  /**
   * Run an async function with this relayer's context
   * @param fn The function to run
   * @returns The result of the function
   */
  public async run<T>(fn: () => Promise<T>): Promise<T> {
    return await LoggerConfig.runWithContext(this._context, fn)
  }

  /**
   * Run an async function with this relayer's context and additional context
   *
   * @param context Additional context to add to the existing context
   * @param fn The function to run
   * @returns The result of the function
   */
  public async runWithContext<T>(
    context: Record<string, unknown>,
    fn: () => Promise<T>,
  ): Promise<T> {
    return await LoggerConfig.runWithContext({ ...this._context, ...context }, fn)
  }

  // Log methods that include context
  public info(message: string, data?: Record<string, unknown>): void {
    this._logger.info(message, { ...this._context, ...data })
  }

  public warn(message: string, data?: Record<string, unknown>): void {
    this._logger.warn(message, { ...this._context, ...data })
  }

  public error(message: string, data?: Record<string, unknown>): void {
    this._logger.error(message, { ...this._context, ...data })
  }

  public debug(message: string, data?: Record<string, unknown>): void {
    this._logger.debug(message, { ...this._context, ...data })
  }
}
