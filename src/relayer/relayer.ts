import { RelayerBase } from './base.ts'
import { Filter, getLevelFilter, Logger, LogLevel, LogRecord } from './logger.ts'
import { InterfaceRelayer } from './ui/interface.ts'
export type { LogLevel }

/**
 * Relayer handles relaying log and user interaction messages.
 */
export class Relayer extends RelayerBase {
  private static initialized: boolean = false
  private static _defaultFilter: Filter = getLevelFilter(this.logLevel)

  protected _interface: InterfaceRelayer | null = null

  static override getInstance<T extends RelayerBase = Relayer>(name?: string | string[]): T {
    return super.getInstance<T>(name)
  }

  /**
   * Initialize the Relayer system
   *
   * This needs to be called once before getInstance()
   */
  public static async initialize(
    { logLevel = this.logLevel, reset = false }: { logLevel?: LogLevel; reset?: boolean } = {},
  ): Promise<boolean> {
    if (this.initialized && !reset) {
      return true
    }

    Logger.appName = this.rootAppName

    this.logLevel = logLevel

    // Create and configure Logtape logger
    await Logger.initLogger(
      Relayer, // Pass the Relayer class to get the sink and filter
      InterfaceRelayer, // Pass the InterfaceRelayer class to get the sink and filter
      {
        appName: this.rootAppName,
        defaultLevel: logLevel as LogLevel,
        reset,
      },
    )

    this.initialized = true

    return true
  }

  public static override filter(record: LogRecord): boolean {
    // Filter at the context level if set
    if (typeof record.properties._filter === 'function') {
      return record.properties._filter(record)
    }
    // Default filter
    return Relayer._defaultFilter(record)
  }

  // Get the interface instance
  public get show() {
    if (!this._interface) {
      this._interface = new InterfaceRelayer({
        name: 'ui',
        context: this._context,
        defaultLevel: this._logLevel,
      })
    }
    return this._interface
  }
}
