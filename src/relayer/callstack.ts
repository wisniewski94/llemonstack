export interface CallStackInfo {
  callStack: Array<{
    module?: string // Optional module name
    function: string // Function name (required)
    fileName: string
    lineNumber: number
    columnNumber: number
    isAsync?: boolean // Optional flag for async functions
  }>
  stackLines: string[]
}

export interface CallStackOptions {
  error?: Error
  callStack?: CallStackInfo | string | string[]
  skip?: number // Number of lines to skip in the stack trace, defaults to 1 (the error line)
  filter?: false | {
    skipEventLoopTick?: boolean
    skipRelayer?: boolean
    skipCommand?: boolean
    skipUnknown?: boolean
  }
}

/**
 * Get the call stack as a string, excluding the line for this function
 *
 * @returns The call stack as a string
 */
export function getCallStackString(): string {
  return getCallStackArray().join('\n')
}

/**
 * Get the call stack as an array of strings
 *
 * Excludes any calls to getCallStack functions.
 *
 * @returns The call stack as an array of strings
 */
export function getCallStackArray(): string[] {
  const err = new Error()
  // Remove the line for this function from the stack trace
  const stack = err.stack || ''
  const lines = stack.split('\n')

  // Find and remove the line for getCallStack function
  const filteredLines = lines.filter((line) => !line.includes('at getCallStack'))

  return filteredLines
}

/**
 * Get the call stack info
 *
 * The returned results are filtered to exclude any eventLoopTick, Relayer, or Command (CLI) calls
 *
 * @param skip - The number of lines to skip in the stack trace
 * @param filter - The filter to apply to the call stack results
 * @returns The call stack info
 */
export function getCallStackInfo({
  error,
  callStack,
  skip = 1, // Number of lines to skip in the stack trace, defaults to 1 (the error line)
  filter = {
    skipEventLoopTick: true,
    skipRelayer: true,
    skipCommand: true,
    skipUnknown: true,
  },
}: CallStackOptions = {}): CallStackInfo {
  let stackLines: string[]

  if (callStack && typeof callStack === 'string') {
    stackLines = callStack.split('\n')
  } else if (callStack && Array.isArray(callStack)) {
    stackLines = callStack
  } else if (callStack && typeof callStack === 'object') {
    stackLines = callStack.stackLines as CallStackInfo['stackLines']
  } else {
    const err = error || new Error()
    const stack = err.stack || ''
    stackLines = stack.split('\n')
  }

  const results = stackLines.slice(skip).map((line) => {
    // First pattern: "at Relayer.log (file:///Users/joe/...)"
    const methodMatch = line.match(/at\s+(?:(\w+)\.)?(\w+)\s+\((file:\/\/\/[^:]+):(\d+):(\d+)\)/)
    if (methodMatch) {
      if (methodMatch[1]) {
        return {
          module: methodMatch[1], // Module name
          function: methodMatch[2], // Function name
          fileName: methodMatch[3],
          lineNumber: parseInt(methodMatch[4], 10),
          columnNumber: parseInt(methodMatch[5], 10),
        }
      } else {
        return {
          function: methodMatch[2], // Function name
          fileName: methodMatch[3],
          lineNumber: parseInt(methodMatch[4], 10),
          columnNumber: parseInt(methodMatch[5], 10),
        }
      }
    }

    // New pattern: "at async Command.execute (https://jsr.io/...)"
    const httpMethodMatch = line.match(
      /at\s+(?:async\s+)?(\w+)\.(\w+)\s+\((https?:\/\/[^:]+(?::[^:]+)?):(\d+):(\d+)\)/,
    )
    if (httpMethodMatch) {
      return {
        module: httpMethodMatch[1],
        function: httpMethodMatch[2],
        fileName: httpMethodMatch[3],
        lineNumber: parseInt(httpMethodMatch[4], 10),
        columnNumber: parseInt(httpMethodMatch[5], 10),
        isAsync: line.includes('async'),
      }
    }

    // Second pattern: "at file:///Users/joe/..."
    const fileMatch = line.match(/at\s+(file:\/\/\/[^:]+):(\d+):(\d+)/)
    if (fileMatch) {
      return {
        function: 'anonymous',
        fileName: fileMatch[1],
        lineNumber: parseInt(fileMatch[2], 10),
        columnNumber: parseInt(fileMatch[3], 10),
      }
    }

    // Third pattern: "at async functionName (file:///...)"
    const asyncMatch = line.match(/at\s+async\s+(\w+)\s+\((file:\/\/\/[^:]+):(\d+):(\d+)\)/)
    if (asyncMatch) {
      return {
        function: asyncMatch[1],
        fileName: asyncMatch[2],
        lineNumber: parseInt(asyncMatch[3], 10),
        columnNumber: parseInt(asyncMatch[4], 10),
        isAsync: true,
      }
    }

    // Fourth pattern: "at ext:core/01_core.js:178:7"
    const extMatch = line.match(/at\s+(\w+)\s+\((ext:[^:]+):(\d+):(\d+)\)/)
    if (extMatch) {
      return {
        function: extMatch[1] || 'external',
        fileName: extMatch[2],
        lineNumber: parseInt(extMatch[3], 10),
        columnNumber: parseInt(extMatch[4], 10),
      }
    }

    // Fifth pattern: "at eventLoopTick (ext:core/01_core.js:178:7)"
    const simpleFuncMatch = line.match(/at\s+(\w+)\s+\(([^:]+):(\d+):(\d+)\)/)
    if (simpleFuncMatch) {
      return {
        function: simpleFuncMatch[1],
        fileName: simpleFuncMatch[2],
        lineNumber: parseInt(simpleFuncMatch[3], 10),
        columnNumber: parseInt(simpleFuncMatch[4], 10),
      }
    }

    // Sixth pattern: "at async Command.actionHandler (file:///...)"
    const asyncMethodMatch = line.match(
      /at\s+async\s+(\w+)\.(\w+)\s+\((file:\/\/\/[^:]+):(\d+):(\d+)\)/,
    )
    if (asyncMethodMatch) {
      return {
        module: asyncMethodMatch[1],
        function: asyncMethodMatch[2],
        fileName: asyncMethodMatch[3],
        lineNumber: parseInt(asyncMethodMatch[4], 10),
        columnNumber: parseInt(asyncMethodMatch[5], 10),
        isAsync: true,
      }
    }

    // Seventh pattern: "at async https://jsr.io/..."
    const asyncUrlMatch = line.match(/at\s+async\s+(https?:\/\/[^:]+):(\d+):(\d+)/)
    if (asyncUrlMatch) {
      return {
        function: 'anonymous',
        fileName: asyncUrlMatch[1],
        lineNumber: parseInt(asyncUrlMatch[2], 10),
        columnNumber: parseInt(asyncUrlMatch[3], 10),
        isAsync: true,
      }
    }

    // If no pattern matches, return the original line for debugging
    return {
      function: 'unknown',
      fileName: line.trim(),
      lineNumber: 0,
      columnNumber: 0,
    }
  })

  const filteredResults = results.filter((result) => {
    if (!filter) {
      return true
    }
    if (filter.skipUnknown && result.function === 'unknown') {
      return false
    }
    if (filter.skipEventLoopTick && result.function.includes('eventLoopTick')) {
      // Skip any eventLoopTick
      return false
    } else if (filter.skipRelayer && result.module?.includes('Relayer')) {
      // Skip any Relayer calls
      return false
    } else if (filter.skipCommand && result.module?.includes('Command')) {
      // Skip any Command (CLI) calls
      return false
    } else {
      return true
    }
  })

  return {
    callStack: filteredResults,
    stackLines,
  }
}
