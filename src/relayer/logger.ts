import {
  compareLogLevel,
  configure,
  Filter,
  FilterLike,
  FormattedValues,
  getAnsiColorFormatter,
  getConfig,
  getConsoleSink,
  getLevelFilter,
  getLogger,
  Logger as LogtapeLogger,
  LogLevel,
  LogRecord,
  Sink,
} from '@logtape/logtape'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Relayer } from './relayer.ts'
import { InterfaceRelayer } from './ui/interface.ts'
export { compareLogLevel, getAnsiColorFormatter, getConfig, getConsoleSink, getLevelFilter }
export type { Filter, FilterLike, FormattedValues, LogLevel, LogRecord, LogtapeLogger, Sink }

// Manually define types that are not exported from logtape
// See https://github.com/dahlia/logtape/blob/67a223479f3605c5fd79e7063d05e044944fc7ef/logtape/logger.ts#L12
export type LogTemplatePrefix = (
  message: TemplateStringsArray,
  ...values: unknown[]
) => unknown[]
export type LogCallback = (prefix: LogTemplatePrefix) => unknown[]
export type LogMessageType = TemplateStringsArray | string | LogCallback

/**
 * Example configuration for a console sink
 * See https://logtape.org/manual/sinks
 *
console: getConsoleSink({
  formatter: getAnsiColorFormatter({
    timestamp: 'date-time-tz',
    timestampColor: 'black',
    timestampStyle: 'bold',
    level: 'ABBR',
    levelStyle: 'bold',
    levelColors: {
      debug: 'blue',
      info: 'green',
      warning: 'yellow',
      error: 'red',
      fatal: 'red',
    },
    category: '.',
    categoryColor: 'red',
    categoryStyle: 'bold',
    value: Deno.inspect, // Function to use to format values
    format: (values) => {
      // values.level  values.message  values.record  values.timestamp
      console.log('values', values)
      return values.category + ' ' + values.message
    },
  }),
}),
*/

/**
 * Config wrapper to get the configured Logtape logger instance
 */
export class Logger {
  private static initialized = false
  private static rootLogger: LogtapeLogger
  private static defaultLevel: LogLevel = 'debug'
  public static appName: string = 'root'

  // AsyncLocalStorage handles implicit context propagation
  public static loggerStorage: AsyncLocalStorage<Record<string, unknown>>

  /**
   * Initialize the logger
   *
   * This needs to be called before using the logger.
   * Messages sent to loggers before initialization will not be logged.
   *
   * @param options - The options for the logger
   */
  public static async initLogger(
    relayer: typeof Relayer,
    uiRelayer: typeof InterfaceRelayer,
    {
      appName = 'app',
      defaultLevel,
      reset = false,
    }: {
      appName?: string
      defaultLevel?: LogLevel
      reset?: boolean
    } = {},
  ): Promise<void> {
    if (this.initialized && !reset) {
      return
    }

    // Create a new AsyncLocalStorage instance for context propagation
    this.loggerStorage = new AsyncLocalStorage<Record<string, unknown>>()

    await this.configureLogger(
      relayer,
      uiRelayer,
      {
        appName,
        defaultLevel: defaultLevel || this.defaultLevel,
        reset,
      },
    )

    this.initialized = true

    // App logger is the default logger for LLemonStack log messages vs docker, etc.
    this.rootLogger = await this.getLogger(appName)
    this.rootLogger.debug('Logger initialized')
  }

  /**
   * Get a logger instance
   *
   * @param name - The name of the logger
   * @returns The logger instance
   */
  public static getLogger(
    name: string | string[],
  ): LogtapeLogger {
    if (!this.initialized) {
      // Log to console since rootLogger is not initialized yet
      console.error('[Logger] Logger not initialized')
    }

    const logger = getLogger(name)

    return logger
  }

  public static getRootLogger() {
    return this.rootLogger
  }

  /**
   * Run an async function with the provided context
   *
   * This method should be called from a Relayer instance.
   * Logs generated in the fn function will inherit the context via AsyncLocalStorage.
   *
   * @param context The context to run the function with
   * @param fn The function to run
   * @returns The result of the function
   */
  public static async runWithContext<T>(
    context: Record<string, unknown>,
    fn: () => Promise<T>,
  ): Promise<T> {
    return await this.loggerStorage.run(context, fn)
  }

  /**
   * Configure Logtape with AsyncLocalStorage support
   *
   * Logtape will throw an error if the configure function is called multiple times.
   * Use the LogtapeLogger class below to get the configured instance.
   *
   * @param options
   */
  private static async configureLogger(
    relayer: typeof Relayer,
    uiRelayer: typeof InterfaceRelayer,
    options: {
      appName: string
      defaultLevel?: LogLevel
      reset?: boolean
    } = { appName: 'app' },
  ) {
    // Return the default logger if it's already initialized
    if (this.initialized && !options.reset) {
      this.rootLogger.debug('Logger already initialized')
      return
    }

    if (options.reset) {
      this.initialized
        ? this.rootLogger.debug('Resetting logger')
        : console.debug('Resetting logger')
    }

    // Configure the Logtape logger
    // After configuration, Logtape's getLogger will be ready to use.
    await configure({
      reset: options.reset, // This resets the logger and allow another configuration
      sinks: {
        // This is the default sink for Logtape meta messages
        consoleMeta: getConsoleSink(),
        // This is the sink for app messages
        app: relayer.getSink(),
        // This is the sink for ui messages
        interface: uiRelayer.getSink(),
      },
      filters: {
        appFilter: relayer.getFilter({ defaultLevel: options.defaultLevel }),
        interfaceFilter: uiRelayer.getFilter({ defaultLevel: options.defaultLevel }),
      },
      loggers: [
        {
          // This routes ui messages to the interface relayer
          category: ['ui'],
          sinks: ['interface'],
          filters: ['interfaceFilter'],
        },
        {
          // This will log all "llmn.*" messages
          category: [options.appName],
          sinks: ['app'],
          filters: ['appFilter'],
        },
        {
          // Disable logtape meta info messages by setting lowestLevel to warning or above.
          // If this isn't here, Logtape will show a debug message warning to add this here.
          // Logtape will show warnings or errors if there are any issues with the other log sinks.
          category: ['logtape', 'meta'],
          lowestLevel: 'warning',
          sinks: ['consoleMeta'],
        },
      ],
      // Enable implicit contexts for context propagation
      contextLocalStorage: this.loggerStorage,
    })
  }
}
