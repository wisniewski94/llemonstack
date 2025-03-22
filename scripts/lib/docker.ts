/**
 * Docker management library
 *
 * TODO: move all docker related functions here
 */

import * as path from 'jsr:@std/path'
import { CONFIG, getComposeFile, getVolumesPath, REPO_DIR, ROOT_DIR } from '../start.ts'
import { runCommand } from './runCommand.ts'
import type { EnvVars, RunCommandOutput } from './types.d.ts'

/**
 * Gets required environment variables to always pass to docker commands
 *
 * @param volumesDir - The directory config to use for volumes, defaults to LLEMONSTACK_VOLUMES_DIR env var value
 * @returns Record<string, string>
 */
export function dockerEnv({ volumesDir }: { volumesDir?: string } = {}): Record<string, string> {
  return {
    LLEMONSTACK_VOLUMES_PATH: getVolumesPath(volumesDir),
    LLEMONSTACK_SHARED_VOLUME_PATH: path.resolve(ROOT_DIR, CONFIG.dirs.shared),
    LLEMONSTACK_IMPORT_VOLUME_PATH: path.resolve(ROOT_DIR, CONFIG.dirs.import),
    LLEMONSTACK_REPOS_PATH: REPO_DIR,
    LLEMONSTACK_NETWORK_NAME: `${Deno.env.get('LLEMONSTACK_PROJECT_NAME')}_network`,
    TARGETPLATFORM: getDockerTargetPlatform(), // Docker platform for building images
    DOCKERFILE_ARCH: getDockerfileArch(), // Dockerfile.arm64 if on Mac Silicon or aarch64 platform
    COMPOSE_IGNORE_ORPHANS: 'true', // Always ignore orphan container warnings
  }
}

export async function getDockerNetworks(
  { projectName }: { projectName?: string },
): Promise<string[]> {
  const networks = await runDockerCommand('network', {
    args: [
      'ls',
      ...(projectName ? ['--filter', `label=com.docker.compose.project=${projectName}`] : []),
      '--format',
      '{{.ID}}',
    ],
    captureOutput: true,
  })
  return networks.toList()
}

export async function removeDockerNetwork(
  networks: string | string[],
  { silent = true }: { silent?: boolean } = {},
): Promise<RunCommandOutput> {
  return await runDockerCommand('network', {
    args: ['rm', '-f', ...(Array.isArray(networks) ? networks : [networks])],
    silent,
  })
}

/**
 * Run a docker compose command and return the output
 *
 * This is a wrapper around runCommand that injects dockerEnv vars.
 *
 * @param cmd - The docker compose to run: up, down, etc.
 * @param args - The arguments to pass to the command
 * @param silent - If true, don't show any output
 * @param captureOutput - If true, capture the output
 * @param env - The environment variables to set
 * @param autoLoadEnv - If true, load env from .env file
 * @returns {RunCommandOutput} The output of the command
 */
export async function runDockerComposeCommand(
  cmd: string, // Docker compose command: up, down, etc.
  {
    composeFile,
    projectName,
    profiles,
    ansi = 'auto',
    args, // Additonal args to pass after the docker command
    silent = false,
    captureOutput = false,
    env = {},
    autoLoadEnv = true, // If true, load env from .env file
  }: {
    composeFile?: string
    projectName?: string
    profiles?: string[]
    ansi?: 'auto' | 'never' | 'always'
    args?: Array<string | false>
    silent?: boolean
    captureOutput?: boolean
    env?: EnvVars
    autoLoadEnv?: boolean
  } = {},
): Promise<RunCommandOutput> {
  return await runCommand('docker', {
    args: [
      'compose',
      ...(ansi ? ['--ansi', ansi] : []),
      '-p',
      projectName || dockerEnv().LLEMONSTACK_PROJECT_NAME,
      ...(composeFile ? ['-f', composeFile] : []),
      ...(profiles || []),
      cmd,
      ...(args || []),
    ],
    silent,
    captureOutput,
    env: {
      ...dockerEnv(),
      ...env,
    },
    autoLoadEnv,
  })
}

/**
 * Run a docker command and return the output
 *
 * This is a wrapper around runCommand that injects dockerEnv vars.
 *
 * @param cmd - The docker compose to run: up, down, etc.
 * @param args - The arguments to pass to the command
 * @param silent - If true, don't show any output
 * @param captureOutput - If true, capture the output
 * @param env - The environment variables to set
 * @param autoLoadEnv - If true, load env from .env file
 * @returns {RunCommandOutput} The output of the command
 */
export async function runDockerCommand(
  cmd: string, // Docker command: ps, network, ls, etc.
  {
    args, // Additonal args to pass after the docker command
    silent = false,
    captureOutput = false,
    env = {},
    autoLoadEnv = true, // If true, load env from .env file
  }: {
    args?: Array<string | false>
    silent?: boolean
    captureOutput?: boolean
    env?: EnvVars
    autoLoadEnv?: boolean
  } = {},
): Promise<RunCommandOutput> {
  return await runCommand('docker', {
    args: [
      cmd,
      ...(args || []),
    ],
    silent,
    captureOutput,
    env: {
      ...dockerEnv(),
      ...env,
    },
    autoLoadEnv,
  })
}

function getDockerTargetPlatform(): string {
  // Map Deno OS to Docker OS
  // const os = Deno.build.os
  // const dockerOs = os === 'windows' ? 'windows' : 'linux'
  const dockerOs = 'linux'

  // Map Deno arch to Docker arch
  const dockerArch = Deno.build.arch === 'aarch64' ? 'arm64' : 'amd64'

  // Return in Docker format: os/arch
  return `${dockerOs}/${dockerArch}`
}

/**
 * Build a docker image
 *
 * @param projectName - The name of the project
 * @param composeFile - The path to the compose file
 * @param envVars - The environment variables to set
 */
// export async function buildImage(
//   projectName: string,
//   composeFile: string,
//   envVars?: Record<string, string>,
//   { noCache = false }: { noCache?: boolean } = {},
// ): Promise<void> {
//   await runCommand(
//     'docker',
//     {
//       args: [
//         'compose',
//         '-p',
//         projectName,
//         '-f',
//         composeFile,
//         'build',
//         noCache && '--no-cache',
//       ],
//       env: envVars,
//     },
//   )
// }

/**
 * Returns Dockerfile.arm64 if on Mac Silicon or aarch64 platform
 * @returns {string} Dockerfile.arm64 or empty string
 */
function getDockerfileArch(): string {
  const arch = Deno.build.arch === 'aarch64' ? 'arm64' : ''
  return arch ? `Dockerfile.${arch}` : ''
}

export async function isServiceRunning(
  service: string,
  { projectName }: { projectName?: string },
) {
  const result = await dockerPs({ projectName }) as DockerPsResult
  return result.some((c) => c.Name === service)
}

export type DockerPsResult = Array<{ ID: string; Name: string }>
export const DefaultDockerFormatTemplate = '{"ID":"{{.ID}}","Name":"{{.Names}}"}'
export async function dockerPs(
  { projectName, format = DefaultDockerFormatTemplate }: { projectName?: string; format?: string } =
    {},
): Promise<DockerPsResult | RunCommandOutput> {
  const results = await runCommand(
    'docker',
    {
      args: [
        'ps',
        '-a',
        '--format',
        format,
        ...(projectName ? ['--filter', `label=com.docker.compose.project=${projectName}`] : []),
      ],
      captureOutput: true,
      silent: true,
    },
  )
  return format === DefaultDockerFormatTemplate ? results.toJsonList() as DockerPsResult : results
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

  return await runDockerComposeCommand('run', {
    projectName,
    composeFile,
    args: [
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

// Define operator types for better type safety
type SubstitutionOperator = ':-' | ':?' | ':+' | ':='

// Define a type for the variable value map
type VariableMap = Record<string, string | undefined | null>

export const DOCKER_COMPOSE_VAR_REGEX = /\${([A-Za-z0-9_]+)(?:(:[-?+=])([^}]*))?}/g

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
    DOCKER_COMPOSE_VAR_REGEX,
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
