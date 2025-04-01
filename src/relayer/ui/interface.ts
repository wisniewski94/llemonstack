import { Config } from '@/core/config/config.ts'
import { CommandError } from '@/lib/command.ts'
import { LogMessage } from '@/types'
import { colors } from '@cliffy/ansi/colors'
import { LoggerConfig, LogLevel, LogRecord, LogtapeLogger, Sink } from '../logger.ts'
import { RowType, showTable, Table, TableOptions } from './tables.ts'

interface UserLogRecord extends LogRecord {
  properties: Record<string, unknown> & {
    _meta?: {
      type: 'user_action' | 'action'
      emoji?: string
      args?: unknown[] // Any additional arguments passed to methods that support debugging
      error?: unknown
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
    // console.log('InterfaceRelayer log', record)

    const data = record.properties
    const meta = data._meta
    const message = record.message.join('')
    const level = record.level
    const emoji: string = meta?.emoji ? meta.emoji : ''

    if (meta?.type === 'user_action') {
      console.log(`${colors.magenta(message)}`)
    } else if (meta?.type === 'action') {
      console.log(`${colors.green(message)}`)
    } else if (level === 'fatal') {
      console.error(`‼️ ${colors.red('ERROR: unable to continue, exiting...')}`)
      showError(message, meta?.error)
      Deno.exit(1)
    } else if (level === 'error') {
      showError(message, meta?.error)
    } else if (level === 'warning') {
      console.warn(`${emoji ? `${emoji} ` : '❗ '}${colors.yellow.bold(message)}`)
    } else if (level === 'info') {
      showInfo(message)
    } else if (level === 'debug') {
      showInfo(`[DEBUG] ${message}`)
      data?._meta?.args?.forEach((arg) => {
        showInfo(`  ${typeof arg === 'object' ? Deno.inspect(arg) : arg}`)
      })
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
  // These methods output to UI without logging the message.
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

  public header(message: string, len = 50): void {
    const padding = '-'.repeat((len - message.length - 2) / 2)
    let header = `${padding} ${message} ${padding}`
    if (header.length < len) {
      header += '-' // handle odd number of characters
    }
    console.log(`\n${colors.cyan.bold(header)}`)
  }

  public credentials(credentials: Record<string, string | null | undefined>): void {
    for (const [key, value] of Object.entries(credentials)) {
      value && showInfo(`  ${key}: ${value}`)
    }
  }

  public serviceHost(service: string, url: string): void {
    console.log(`${service}: ${colors.yellow(url)}`)
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
    this.logger.warn(message, { ...this.context, ...data, _meta: { emoji: data?.emoji } })
  }

  public error(message: string | Error, data?: Record<string, unknown>): void {
    this.handleError('error', message, data)
  }

  public fatal(message: string, data?: Record<string, unknown>): void {
    this.handleError('fatal', message, data)
  }

  public debug(message: string, ...args: unknown[]): void {
    this.logger.debug(message, { ...this.context, _meta: { args } })
  }

  public action(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, { ...this.context, ...data, _meta: { type: 'action' } })
  }

  public userAction(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, { ...this.context, ...data, _meta: { type: 'user_action' } })
  }

  public handleError(
    level: LogLevel,
    message: string | Error,
    data?: Record<string, unknown>,
  ): void {
    // If message is not a string, extract the string from it and set _meta.error
    let metaError: unknown
    if (message instanceof Error) {
      metaError = message
      message = String(message)
    }
    const context = {
      ...this.context,
      ...data,
      _meta: { error: metaError || data?.error },
    }
    if (level === 'fatal') {
      this.logger.fatal(message, context)
      Deno.exit(1)
    } else {
      this.logger.error(message, context)
    }
  }

  public logMessages(
    messages: LogMessage[],
    { debug = Config.getInstance().DEBUG }: { debug?: boolean } = {},
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
          if (debug) {
            message.args !== undefined
              ? this.debug(message.message, message.args)
              : this.debug(message.message)
          }
          break
        default:
        case 'info':
          this.info(message.message)
          break
      }
    })
  }
}

//
// Helper functions
//

function showInfo(message: string): void {
  console.log(`${colors.gray(message)}`)
}

function showError(msgOrError: string | unknown, err?: unknown): void {
  const message = (typeof msgOrError === 'string') ? msgOrError : null
  const error = err || msgOrError
  const logError = (message: string, ...args: unknown[]) => {
    if (args.length > 0 && args[0] === message) {
      args.shift()
    }
    console.error(colors.red(message), ...args)
  }
  if (error instanceof CommandError) {
    message && logError(message)
    logError(`Command failed: "${error.cmd}" \n${error.stderr}`)
  } else {
    let errorMessage: string | undefined
    if (error && typeof error === 'object') {
      errorMessage = 'message' in error
        ? error.message as string
        : 'stderr' in error
        ? error.stderr as string
        : String(error)
    } else {
      errorMessage = String(error)
    }
    if (message) {
      logError(message, errorMessage)
    } else {
      logError(errorMessage)
    }
  }
}
