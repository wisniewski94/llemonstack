/**
 * Comprehensive Docker/shell-style variable expansion supporting various expansion patterns
 *
 * @param input - The string to expand variables in
 * @param envVars - Object containing environment variables
 * @param modifyEnv - Whether to allow modifying the environment variables (for :=)
 * @param errorOnMissing - Whether to throw an error on missing variables (:?)
 * @returns The expanded string with all variables resolved
 * @throws Error when a required variable is not set (:?)
 */
export function expandEnvVars(
  input: string,
  envVars: Record<string, string | undefined>,
  options: { modifyEnv?: boolean; errorOnMissing?: boolean } = {},
): string {
  if (!input || !input.includes('$')) {
    return input
  }

  // Clone the env vars if we're allowing modifications
  const workingEnv = options.modifyEnv ? { ...envVars } : envVars

  // We'll repeat the expansion until there are no more changes
  let result = input
  let previousResult = ''
  let iterations = 0
  const maxIterations = 10

  // Process the string repeatedly until all variables are resolved
  while (result !== previousResult && iterations < maxIterations) {
    previousResult = result

    // Find variable patterns, starting with the innermost ones
    // This regex matches the various forms of variable expansion
    const varRegex = /\${([^{}:]+)(?::([?+=-])([^{}]*))?}|\$([a-zA-Z0-9_]+)/g

    result = result.replace(varRegex, (_match, varNameBraces, operator, operand, varNameSimple) => {
      const varName = varNameBraces || varNameSimple
      const value = workingEnv[varName]
      const isVarSet = value !== undefined && value !== ''

      // Simple variable expansion with no operator
      if (!operator && varNameBraces) {
        return isVarSet ? value : ''
      }

      // Simple $VAR form
      if (varNameSimple) {
        return isVarSet ? value : ''
      }

      // Process each operator type
      switch (operator) {
        // Default value: ${VAR:-default}
        case '-':
          return isVarSet ? value : operand

        // Error if not set: ${VAR:?error}
        case '?':
          if (!isVarSet) {
            const errorMsg = operand || `Variable ${varName} is required but not set`
            if (options.errorOnMissing) {
              throw new Error(errorMsg)
            }
            return ''
          }
          return value

        // Alternate value: ${VAR:+alternate}
        case '+':
          return isVarSet ? operand : ''

        // Assign default: ${VAR:=default}
        case '=':
          if (!isVarSet && options.modifyEnv) {
            // Process the default value in case it contains variables
            const processedDefault = expandEnvVars(operand, workingEnv, options)
            workingEnv[varName] = processedDefault
            return processedDefault
          } else if (!isVarSet) {
            // If modification not allowed, just return the default but don't assign
            return operand
          }
          return value

        // No operator or unknown operator
        default:
          return isVarSet ? value : ''
      }
    })

    iterations++
  }

  // Apply any changes back to the original env object if modifyEnv is true
  if (options.modifyEnv) {
    Object.assign(envVars, workingEnv)
  }

  return result
}
