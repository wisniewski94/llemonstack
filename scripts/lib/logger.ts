import { colors } from '@cliffy/ansi/colors'
import { CellType, Column, RowType, Table } from '@cliffy/table'
import { CommandError } from './command.ts'
import type { LogMessage } from './types.d.ts'

const DEFAULT_MAX_COLUMN_WIDTH = 50

export { colors }
export type { CellType, RowType }

/**
 * Prompt the user to confirm an action
 * @param message - The message to display to the user
 * @returns True if the user confirms, false otherwise
 */
export function confirm(message: string, defaultAnswer: boolean = false): boolean {
  const input = prompt(`${colors.yellow(message)} ${defaultAnswer ? '[Y/n]' : '[y/N]'}`)
  return input?.toLowerCase() === 'y' || (!input && defaultAnswer)
}

export function showDebug(message: string, ...args: unknown[]): void {
  showInfo(`[DEBUG] ${message}`)
  args?.length && args.forEach((arg) => {
    showInfo(`  ${typeof arg === 'object' ? JSON.stringify(arg) : arg}`)
  })
}

// Shows magenta text, prompting user to take an action later on
export function showUserAction(message: string): void {
  console.log(`${colors.magenta(message)}`)
}

// Shows service name in default and url in yellow text
export function showService(service: string, url: string): void {
  console.log(`${service}: ${colors.yellow(url)}`)
}

// Shows username and password in gray text
export function showCredentials(credentials: Record<string, string | null | undefined>): void {
  for (const [key, value] of Object.entries(credentials)) {
    value && showInfo(`  ${key}: ${value}`)
  }
}

// Shows green text
export function showAction(message: string): void {
  console.log(`${colors.green(message)}`)
}

// Shows cyan text in uppercase
export function showHeader(message: string, len = 50): void {
  const padding = '-'.repeat((len - message.length - 2) / 2)
  let header = `${padding} ${message} ${padding}`
  if (header.length < len) {
    header += '-' // handle odd number of characters
  }
  console.log(`\n${colors.cyan.bold(header)}`)
}

export function showError(msgOrError: string | unknown, err?: unknown): void {
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

// Shows red text
export function showWarning(message: string, emoji?: string): void {
  emoji = (emoji === undefined) ? '❗ ' : emoji ? `${emoji} ` : ''
  console.warn(`${emoji}${colors.yellow.bold(message)}`)
}

// Shows gray text
export function showInfo(message: string): void {
  console.log(`${colors.gray(message)}`)
}

export function showLogMessages(
  messages: LogMessage[],
): void {
  messages.forEach((message) => {
    switch (message.level) {
      case 'error':
        showError(message.message, message.error)
        break
      case 'warning':
        showWarning(message.message)
        break
      case 'debug':
        message.args !== undefined
          ? showDebug(message.message, message.args)
          : showDebug(message.message)
        break
      default:
      case 'info':
        showInfo(message.message)
        break
    }
  })
}

function truncate(cell: string | CellType, maxColumnWidth: number = DEFAULT_MAX_COLUMN_WIDTH) {
  const cellStr = String(cell)
  const strNoColors = colors.stripAnsiCode(cellStr)
  if (strNoColors.length > maxColumnWidth) {
    // Get any ANSI escape sequences at the start of the string
    // cspell:disable
    const ansiRegex =
      // deno-lint-ignore no-control-regex
      /^(?:[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])+/
    // cspell:enable
    const ansiMatch = cellStr.match(ansiRegex)
    const ansiPrefix = ansiMatch ? ansiMatch[0] : ''
    const ansiSuffix = ansiPrefix ? '\x1b[0m' : ''
    if (ansiPrefix) {
      return `${colors.gray('…')}${ansiPrefix}${
        strNoColors.substring(strNoColors.length - (maxColumnWidth - 3))
      }${ansiSuffix}`
    }
    return `${colors.gray('…')}${cellStr.substring(cellStr.length - (maxColumnWidth - 3))}`
  }
  return cell
}

export function showTable(
  header: RowType,
  rows: RowType[],
  maxColumnWidth: number = DEFAULT_MAX_COLUMN_WIDTH,
) {
  // Push header onto rows to preserve column alignment for headers
  rows.unshift(header.map((h) => colors.underline(h as string)))

  // Truncate any column value longer than MAX_COLUMN_WIDTH
  const truncatedRows = rows.map((row) => {
    return row.map((cell) => {
      return cell ? truncate(cell, maxColumnWidth) : ''
    })
  })

  new Table()
    // .header(header)
    .body(truncatedRows)
    .padding(2)
    .indent(2)
    .border(false)
    .column(0, new Column().align('right'))
    .column(3, new Column().align('right'))
    .render()
}
