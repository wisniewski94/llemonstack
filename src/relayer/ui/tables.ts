import { colors } from '@cliffy/ansi/colors'
import { Border, CellType, RowType, Table } from '@cliffy/table'

export { type RowType, Table }

const DEFAULT_MAX_COLUMN_WIDTH = 50

export interface TableOptions {
  maxColumnWidth?: number
  border?: boolean
  borderChars?: Border
  render?: boolean
  color?: (str: string) => string
  indent?: number
  padding?: number
  sort?: boolean
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
    sort = false,
  }: TableOptions = {},
): Table {
  if (sort) {
    rows = rows.sort((a, b) => {
      return String(a[0] || '').localeCompare(String(b[0] || ''))
    })
  }

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
