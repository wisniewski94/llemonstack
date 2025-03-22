/**
 * Docker management library
 *
 * TODO: move all docker related functions here
 */

import { dockerEnv, getComposeFile, runCommand } from '../start.ts'
import { RunCommandOutput } from './runCommand.ts'

// TODO: move dockerEnv from start.ts to here once Config lib is ready

// Define operator types for better type safety
type SubstitutionOperator = ':-' | ':?' | ':+' | ':='

// Define a type for the variable value map
type VariableMap = Record<string, string | undefined | null>

const dockerComposeVarRegex = /\${([A-Za-z0-9_]+)(?:(:[-?+=])([^}]*))?}/g

/**
 * Replace Docker Compose variables in a string
 *
 * This regex matches all Docker Compose variable syntaxes:
 * - ${VAR} - simple variable
 * - ${VAR:-default} - variable with default value
 * - ${VAR:?error} - variable with error message if not set
 * - ${VAR:+alternate} - alternate value if variable is set
 * - ${VAR:=default} - assign default value with variable substitution
 *
 * @param str - The string containing Docker Compose variables
 * @param valueMap - Map of variable names to values
 * @param errorOnMissing - Whether to throw an error on missing variables
 * @returns The string with variables replaced
 */
export function replaceDockerComposeVars(
  str: string,
  valueMap: VariableMap = {},
  errorOnMissing: boolean = false,
): string {
  return str.replace(
    dockerComposeVarRegex,
    (
      match: string,
      varName: string,
      operator: string | undefined,
      defaultVal: string | undefined,
    ): string => {
      // Check if variable exists in the map
      const hasVar = Object.prototype.hasOwnProperty.call(valueMap, varName)
      const varValue = valueMap[varName]
      const isEmpty = varValue === undefined || varValue === null || varValue === ''

      // Handle simple variable without operator: ${VAR}
      if (!operator) {
        if (!hasVar && errorOnMissing) {
          throw new Error(`Variable "${varName}" not found`)
        }
        return hasVar ? varValue as string : ''
      }

      // Cast operator to the appropriate type
      const op = operator as SubstitutionOperator

      switch (op) {
        case ':-':
          // Use default if var is unset or empty: ${VAR:-default}
          return isEmpty ? (defaultVal || '') : (varValue as string)

        case ':?':
          // Error if var is unset or empty: ${VAR:?error}
          if (isEmpty) {
            const errorMsg = defaultVal || `Variable "${varName}" is required but not set`
            throw new Error(errorMsg)
          }
          return varValue as string

        case ':+':
          // Use alternate value if var is set and not empty: ${VAR:+alternate}
          return !isEmpty ? (defaultVal || '') : ''

        case ':=':
          // Assign default with variable substitution: ${VAR:=default}
          if (isEmpty) {
            // Note: For complete implementation, you'd need to recursively process
            // the default value for nested variables
            return defaultVal || ''
          }
          return varValue as string

        default:
          return match // Return original if unknown operator (shouldn't happen with type safety)
      }
    },
  )
}

export async function prepareDockerNetwork(
  // TODO: get network from config
  network = dockerEnv().LLEMONSTACK_NETWORK_NAME,
): Promise<{ network: string; created: boolean }> {
  const result = await runCommand('docker', {
    args: ['network', 'ls'],
    captureOutput: true,
    silent: true,
  })
  if (!result.toString().includes(network)) {
    await runCommand('docker', {
      args: ['network', 'create', network],
      silent: true,
    })
    return {
      network,
      created: true,
    }
  } else {
    return {
      network,
      created: false,
    }
  }
}

/**
 * Execs a command in an existing docker container
 * @param {string} projectName - The name of the project
 * @param {string} service - The name of the service
 * @param {string} cmd - The command to run
 * @param {Object} options - The options for the Command
 */
export async function dockerExec(
  projectName: string,
  service: string,
  cmd: string,
  { composeFile, args, silent = true, captureOutput = false }: {
    composeFile?: string
    args?: Array<string | false>
    silent?: boolean
    captureOutput?: boolean
  } = {},
): Promise<RunCommandOutput> {
  if (!composeFile) {
    composeFile = (await getComposeFile(service)) || undefined
  }
  if (!composeFile) {
    throw new Error(`Compose file not found for ${service}`)
  }

  await prepareDockerNetwork()

  return await runCommand('docker', {
    args: [
      'compose',
      '-p',
      projectName,
      '-f',
      composeFile,
      'exec',
      service,
      cmd,
      ...(args || []),
    ],
    captureOutput,
    silent,
  })
}

/**
 * Runs a command in a new docker container
 * @param {string} projectName - The name of the project
 * @param {string} service - The name of the service
 * @param {string} cmd - The command to run
 * @param {Object} options - The options for the Command
 */
export async function dockerRun(
  projectName: string,
  service: string,
  cmd: string,
  { composeFile, args, silent = true, captureOutput = false }: {
    composeFile?: string
    args?: Array<string | false>
    silent?: boolean
    captureOutput?: boolean
  } = {},
): Promise<RunCommandOutput> {
  if (!composeFile) {
    composeFile = (await getComposeFile(service)) || undefined
  }
  if (!composeFile) {
    throw new Error(`Compose file not found for ${service}`)
  }

  await prepareDockerNetwork()

  return await runCommand('docker', {
    args: [
      'compose',
      '-p',
      projectName,
      '-f',
      composeFile,
      'run',
      '--rm',
      '--entrypoint',
      cmd,
      service,
      ...(args || []),
    ],
    captureOutput,
    silent,
  })
}
