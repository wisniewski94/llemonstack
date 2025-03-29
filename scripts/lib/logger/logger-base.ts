import { colors } from '../logger.ts'

// Type for the proxied logger that combines both defined and dynamic methods
type LoggerProxy = Logger & {
  [key: string]: (...args: unknown[]) => void
}

class Logger {
  public static instance: Logger
  public static getInstance(): Logger {
    if (!Logger.instance) {
      l
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  public silent: boolean = false

  private _showHelpers = {
    header: (msg: string) => console.log(colors.blue(msg)),
    userAction: (msg: string) => console.log(colors.cyan(msg)),
  }

  // Regular log methods
  info(...args: any[]): void {
    if (!this.silent) console.log('[INFO]', ...args)
  }

  error(...args: any[]): void {
    if (!this.silent) console.error('[ERROR]', ...args)
  }

  get show() {
    return this._showHelpers
  }

  // Create a proxy to handle undefined methods
  static create(): LoggerProxy {
    const logger = new Logger()
    return new Proxy(logger, {
      get(target, prop: string, receiver) {
        // If property exists on the target, return it
        if (prop in target) {
          return Reflect.get(target, prop, receiver)
        }

        // Return a function that will log with the property name as level
        return (...args: any[]) => {
          if (!target.silent) {
            console.log(`[${prop.toUpperCase()}]`, ...args)
          }
        }
      },
    }) as LoggerProxy
  }
}

// Usage
const log = Logger.create()
log.info('This is defined') // Uses the defined infomethod
log.debug('Testing') // Auto-captured as "[DEBUG] Testing"
log.show.header('Hello, world!')
log.show.userAction('Hello, world!')
