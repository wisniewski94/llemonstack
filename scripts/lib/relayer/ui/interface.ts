import { colors } from '@cliffy/ansi/colors'
import { LoggerConfig, LogLevel, LogRecord, LogtapeLogger, Sink } from '../logger.ts'
import { RowType, showTable, Table, TableOptions } from './tables.ts'

interface UserLogRecord extends LogRecord {
  properties: Record<string, unknown> & {
    _meta?: {
      type: 'userAction'
    }
  }
}

/**
 * Relayer for user interaction messages
 */
export class InterfaceRelayer {
  private static instance: InterfaceRelayer
  private _logLevel: LogLevel = 'info'
  private initialized: boolean = false
  protected _logger: LogtapeLogger
  protected context: Record<string, unknown>

  public static getUISink(): Sink {
    return this.log as Sink
  }

  public static log(record: UserLogRecord): void {
    // TODO: check the levels and
    console.log('InterfaceRelayer log', record)
    if (record.properties._meta?.type === 'userAction') {
      console.log(`${colors.magenta(record.message.join(''))}`)
    }
  }

  constructor(
    options: {
      context?: Record<string, unknown>
      logger?: LogtapeLogger
    } = {},
  ) {
    this._logger = LoggerConfig.getLogger(['ui'])

    // Save context to auto populate context for all log messages below
    this.context = options.context || {}
  }

  get logger() {
    return this._logger
  }

  //
  // Interaction Methods
  //
  // These methods do not route through the logger.
  //

  /**
   * Prompt the user to confirm an action
   * @param message - The message to display to the user
   * @returns True if the user confirms, false otherwise
   */
  public confirm(message: string, defaultAnswer: boolean = false): boolean {
    const input = prompt(`${colors.yellow(message)} ${defaultAnswer ? '[Y/n]' : '[y/N]'}`)
    return input?.toLowerCase() === 'y' || (!input && defaultAnswer)
  }

  public table(
    header: RowType | null,
    rows: RowType[],
    options: TableOptions = {},
  ): Table {
    return showTable(header, rows, options)
  }

  //
  // Log Methods
  //
  // These add context and route to the log method above.
  // This allows for multiple sinks or context aware filters to process
  // the user log messages.
  //

  // Log methods that include context
  public info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, { ...this.context, ...data })
    // console.log(`${colors.gray(message)}`)
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

  public userAction(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, { ...this.context, ...data, _meta: { type: 'userAction' } })
  }

  public header(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, { ...this.context, ...data, _meta: { type: 'header' } })
  }
}
