import { getLogger } from '@logtape/logtape'
import { LoggerConfig, LogLevel, LogtapeLogger } from './logtape-logger.ts'
/**
 * Relayer handles relaying log and user interaction messages.
 */
export class Relayer {
  private static instance: Relayer
  public static appName: string = 'llmn'

  protected _logger: LogtapeLogger
  protected context: Record<string, unknown>

  private _logLevel: LogLevel = 'info'

  /**
   * Get the singleton instance of the Relayer
   * @returns The singleton instance of the Relayer
   */
  public static async getInstance(context?: Record<string, unknown>): Promise<Relayer> {
    if (this.instance) {
      return this.instance
    }

    // Create and configure Logtape logger
    await LoggerConfig.initLogger(this.appName, {
      // TODO: get log level from env
      defaultLevel: 'debug',
    })

    const logger = LoggerConfig.getLogger(this.appName)

    this.instance = new Relayer({ name: this.appName, logger, context })

    return this.instance
  }

  constructor(
    options: {
      name?: string
      context?: Record<string, unknown>
      logger?: LogtapeLogger
    } = {},
  ) {
    const moduleName = options.name

    this._logger = getLogger()

    this._logger = options.logger
      ? options.logger
      : moduleName
      ? LoggerConfig.getLogger([Relayer.appName, moduleName])
      : LoggerConfig.getLogger(Relayer.appName)

    // Save context to auto populate context for all log messages below
    this.context = options.context || {}
  }

  get logger() {
    return this._logger
  }

  /**
   * Creates a new Relayer with combined context
   * @param additionalContext Context to add to the existing context
   * @returns A new Relayer instance with the combined context
   */
  public withContext(additionalContext: Record<string, unknown>): Relayer {
    // Combine this Relayer's context with additional context
    const newContext = { ...this.context, ...additionalContext }

    return new Relayer({
      name: this.logger.category[1],
      context: newContext,
    })
  }

  /**
   * Run an async function with this relayer's context
   * @param fn The function to run
   * @returns The result of the function
   */
  public async run<T>(fn: () => Promise<T>): Promise<T> {
    return await LoggerConfig.runWithContext(this.context, fn)
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
    return await LoggerConfig.runWithContext({ ...this.context, ...context }, fn)
  }

  // Log methods that include context
  public info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, { ...this.context, ...data })
  }

  public warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(message, { ...this.context, ...data })
  }

  public error(message: string, data?: Record<string, unknown>): void {
    this.logger.error(message, { ...this.context, ...data })
  }

  public debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(message, { ...this.context, ...data })
  }
}
