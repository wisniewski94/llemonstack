/**
 * Docker management library
 *
 * TODO: move all docker related functions here
 * TODO: convert into a class
 * TODO: add a catchall method that auto detects 'try' prefix and wraps the result in a TryCatchResult?
 */

import type { EnvVars, RunCommandOutput } from '@/types'
import { runCommand } from './command.ts'
import { Config } from './core/config/config.ts'
import Host from './core/config/host.ts'
import { tryCatch, TryCatchResult } from './try-catch.ts'

export type DockerComposeOptions = {
  composeFile?: string | string[]
  projectName?: string
  profiles?: string[]
  ansi?: 'auto' | 'never' | 'always'
  args?: Array<string | false>
  silent?: boolean
  captureOutput?: boolean
  env?: EnvVars
  autoLoadEnv?: boolean
}

export type DockerComposePsResult = Array<{
  ID?: string
  Name?: string
  Health?: string
  Status?: string
  Image?: string
  Service?: string
  Project?: string
  RunningFor?: string
  Size?: string
  State?: string
}>

/**
 * Gets required environment variables to always pass to docker commands
 *
 * @returns Record<string, string>
 */
export async function dockerEnv(config?: Config): Promise<Record<string, string>> {
  if (!config) {
    config = Config.getInstance()
    await config.initialize()
  }
  return {
    LLEMONSTACK_VOLUMES_PATH: config.volumesDir,
    LLEMONSTACK_SHARED_VOLUME_PATH: config.sharedDir,
    LLEMONSTACK_IMPORT_VOLUME_PATH: config.importDir,
    LLEMONSTACK_REPOS_PATH: config.reposDir,
    LLEMONSTACK_NETWORK_NAME: config.dockerNetworkName,
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
 * @param args {DockerComposeOptions} - The options for the command
 * @returns {TryCatchResult<RunCommandOutput>} The output of the command
 */
export async function tryDockerCompose(
  cmd: string, // Docker compose command: up, down, etc.
  options: DockerComposeOptions = {},
): Promise<TryCatchResult<RunCommandOutput>> {
  return await tryCatch(runDockerComposeCommand(cmd, options))
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
    projectName = Config.getInstance().projectName,
    profiles,
    ansi = 'auto',
    args, // Additional args to pass after the docker command
    silent = false,
    captureOutput = false,
    env = {},
    autoLoadEnv = true, // If true, load env from .env file
  }: DockerComposeOptions = {},
): Promise<RunCommandOutput> {
  const composeFiles = Array.isArray(composeFile) ? composeFile : [composeFile]
  return await runCommand('docker', {
    args: [
      'compose',
      ...(ansi ? ['--ansi', ansi] : []),
      '-p',
      projectName,
      ...(composeFiles.map((file) => file ? ['-f', file] : []).flat()),
      ...(profiles ? profiles.map((profile) => ['--profile', profile]) : []).flat(),
      cmd,
      ...(args || []),
    ].filter(Boolean),
    silent,
    captureOutput,
    env: {
      ...(await dockerEnv()),
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
    args, // Additional args to pass after the docker command
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
      ...(await dockerEnv()),
      ...env,
    },
    autoLoadEnv,
  })
}

function getDockerTargetPlatform(): string {
  // TODO: remove these old code comments
  // // Map Deno OS to Docker OS
  // // const os = Deno.build.os
  // // const dockerOs = os === 'windows' ? 'windows' : 'linux'
  // const dockerOs = 'linux'

  // // Map Deno arch to Docker arch
  // const dockerArch = Deno.build.arch === 'aarch64' ? 'arm64' : 'amd64'

  const host = Host.getInstance()

  const dockerOs = host.isWindows() ? 'windows' : 'linux'
  const dockerArch = host.isArm64() ? 'arm64' : 'amd64'

  // Return in Docker format: os/arch
  return `${dockerOs}/${dockerArch}`
}

/**
 * Returns Dockerfile.arm64 if on Mac Silicon or aarch64 platform
 * @returns {string} Dockerfile.arm64 or empty string
 */
function getDockerfileArch(): string {
  const arch = Host.getInstance().arch === 'arm64' ? 'arm64' : ''
  return arch ? `Dockerfile.${arch}` : ''
}

export async function tryDockerComposePs(
  projectName: string,
  { services }: { services?: string | string[] } = {},
): Promise<TryCatchResult<DockerComposePsResult>> {
  return await tryCatch(dockerComposePs(projectName, {
    format: 'json',
    services,
  }))
}

type PsFormatType = 'json' | 'table' | string

export async function dockerComposePs<T extends PsFormatType>(
  projectName: string,
  { format = 'json' as T, services }: { format?: T; services?: string | string[] } = {},
): Promise<T extends 'json' ? DockerComposePsResult : string[]> {
  const results = await runCommand(
    'docker',
    {
      args: [
        'compose',
        '-p',
        projectName,
        'ps',
        '-a',
        '--format',
        format as string,
        ...(Array.isArray(services) ? services : [services]),
      ],
      captureOutput: true,
      silent: true,
    },
  )

  return format.startsWith('table')
    // deno-lint-ignore no-explicit-any
    ? results.toList() as any
    // deno-lint-ignore no-explicit-any
    : results.toJsonList() as any
}

export async function prepareDockerNetwork(
  network?: string,
): Promise<{ network: string; created: boolean }> {
  if (!network) {
    network = Config.getInstance().dockerNetworkName
  }
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
  { composeFile, args, silent = false, captureOutput = false }: {
    composeFile?: string
    args?: Array<string | false>
    silent?: boolean
    captureOutput?: boolean
  } = {},
): Promise<RunCommandOutput> {
  if (!composeFile) {
    const config = Config.getInstance()
    await config.initialize()
    composeFile = config.getServiceByName(service)?.composeFile || undefined
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
    const config = Config.getInstance()
    await config.initialize()
    composeFile = config.getServiceByName(service)?.composeFile || undefined
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

/**
 * Build a docker image
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
