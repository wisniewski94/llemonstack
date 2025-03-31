import type { LogMessage } from '@/types'
import { colors } from '@cliffy/ansi/colors'
import { Border, Cell, CellType, Column, Row, RowType, Table } from '@cliffy/table'
import { CommandError } from './command.ts'
import { Config } from './core/config/config.ts'
const DEFAULT_MAX_COLUMN_WIDTH = 50

export { Cell, colors, Column, Row, Table }
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

// TODO: check LLEMONSTACK_LOG_LEVEL env var to determine what level of messages to show
// Use Deno.env a the basic global config manager and Config for the complicated stack config
export function showLogMessages(
  messages: LogMessage[],
  { debug = Config.getInstance().DEBUG }: { debug?: boolean } = {},
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
        if (debug) {
          message.args !== undefined
            ? showDebug(message.message, message.args)
            : showDebug(message.message)
        }
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

/**
 * Create and optionally render a table to console
 *
 * To configure settings like column alignment, set render to false
 * and then configure the returned table.
 *
 * ```typescript
 * const table = showTable(['H1', 'H2'], [['Row1A', 'Row1B']], { render: false })
 * table.column(0, new Column().align('right'))
 * table.render()
 * ```
 *
 * @param header - The header row of the table
 * @param rows - The rows of the table
 * @param options - The options for the table
 * @returns The table
 */
export function showTable(
  header: RowType | null,
  rows: RowType[],
  {
    maxColumnWidth = DEFAULT_MAX_COLUMN_WIDTH,
    border = false,
    borderChars,
    render = true,
    color: tableColor,
    indent = 2,
    padding = 2,
  }: {
    maxColumnWidth?: number
    border?: boolean
    borderChars?: Border
    render?: boolean
    color?: (str: string) => string
    indent?: number
    padding?: number
  } = {},
): Table {
  if (!border && header) {
    // Push header onto rows to preserve column alignment for headers
    rows.unshift(header.map((h) => colors.underline(h as string)))
    header = null
  }

  if (maxColumnWidth > 0) {
    // Truncate any column value longer than MAX_COLUMN_WIDTH
    rows = rows.map((row) => {
      return row.map((cell) => {
        return cell ? truncate(cell, maxColumnWidth) : ''
      })
    })
  }

  let table = new Table()

  if (header) {
    table = table.header(header)
  }

  table = table.body(rows)
    .padding(padding)
    .indent(indent)
    .border(border)

  if (borderChars) {
    table = table.chars(borderChars as Border)
  }

  // See https://cliffy.io/docs@v1.0.0-rc.7/table/options#border
  // borderChars: {
  //   'top': '─',
  //   'topMid': '─',
  //   'topLeft': '┌',
  //   'topRight': '┐',
  //   'bottom': '─',
  //   'bottomMid': '─',
  //   'bottomLeft': '└',
  //   'bottomRight': '┘',
  //   'left': '│',
  //   'leftMid': '├',
  //   'mid': '─',
  //   'midMid': '─',
  //   'right': '│',
  //   'rightMid': '┤',
  //   'middle': '─',
  // },

  if (render) {
    if (tableColor) {
      console.log(tableColor(table.toString()))
    } else {
      table.render()
    }
  }

  return table
}
