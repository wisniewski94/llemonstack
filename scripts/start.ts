#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Start docker services
 *
 * This is the main script that configures and starts the stack.
 *
 * Usage:
 *
 * ```bash
 * deno run start
 * ```
 *
 * To add a new service...
 * 1. Add the compose file to the docker/ folder
 * 2. Add the service to the ALL_COMPOSE_SERVICES array below
 * 3. Add a startService call in the main start function
 */

import { colors } from '@cliffy/ansi/colors'
import { load as loadDotEnv } from 'jsr:@std/dotenv'
import * as fs from 'jsr:@std/fs'
import * as path from 'jsr:@std/path'
import * as yaml from 'jsr:@std/yaml'

// Immediately load .env file
await loadEnv({ silent: false })

const isArm64 = getArch().includes('arm64')
export const VERSION = '0.1.0'

export const ENVFILE = path.join(Deno.cwd(), '.env')

/*******************************************************************************
 * CONFIG
 *******************************************************************************/
// Project name for docker compose
export const DEFAULT_PROJECT_NAME = 'llemonstack'

// Directory used to git clone repositories: supabase, zep, etc.
export const REPO_DIR_BASE = '.repos'

// Directory used to share files between services
// Added as a volume in docker-compose.yml
export const SHARED_DIR_BASE = 'shared'

export const IMPORT_DIR_BASE = 'import'

export const LLEMONSTACK_CONFIG_DIR = path.join(Deno.cwd(), '.llemonstack')
export const LLEMONSTACK_CONFIG_FILE = path.join(LLEMONSTACK_CONFIG_DIR, 'config.json')

// Enable extra debug logging
export const DEBUG = Deno.env.get('LLEMONSTACK_DEBUG')?.toLowerCase() === 'true'

export const ROOT_DIR = Deno.cwd()
export const REPO_DIR = escapePath(path.join(ROOT_DIR, REPO_DIR_BASE))
export const SHARED_DIR = escapePath(path.join(ROOT_DIR, SHARED_DIR_BASE))
export const COMPOSE_IMAGES_CACHE = {} as Record<string, ServiceImage[]>

// All services with a docker-compose.yml file
// Includes services with a custom Dockerfile
// [service name, compose file, auto run]
// When auto run is true, the service is started automatically if enabled.
// When auto run is false, the service needs to be started manually.
export type ComposeService = [string, string, boolean]
export const ALL_COMPOSE_SERVICES: ComposeService[] = [
  ['supabase', path.join('docker', 'docker-compose.supabase.yml'), true],
  ['n8n', path.join('docker', 'docker-compose.n8n.yml'), true],
  ['flowise', path.join('docker', 'docker-compose.flowise.yml'), true],
  ['neo4j', path.join('docker', 'docker-compose.neo4j.yml'), true],
  ['zep', path.join('docker', 'docker-compose.zep.yml'), true],
  ['browser-use', path.join('docker', 'docker-compose.browser-use.yml'), false], // Uses a custom start function
  ['qdrant', path.join('docker', 'docker-compose.qdrant.yml'), true],
  ['openwebui', path.join('docker', 'docker-compose.openwebui.yml'), true],
  ['ollama', path.join('docker', 'docker-compose.ollama.yml'), false], // Uses a custom start function
  ['prometheus', path.join('docker', 'docker-compose.prometheus.yml'), true],
  ['redis', path.join('docker', 'docker-compose.redis.yml'), true],
  ['clickhouse', path.join('docker', 'docker-compose.clickhouse.yml'), true],
  ['minio', path.join('docker', 'docker-compose.minio.yml'), true],
  ['langfuse', path.join('docker', 'docker-compose.langfuse.yml'), true],
  ['litellm', path.join('docker', 'docker-compose.litellm.yml'), true],
  ['dozzle', path.join('docker', 'docker-compose.dozzle.yml'), true],
]

// Groups of services, dependencies first
export const SERVICE_GROUPS: [string, string[]][] = [
  ['databases', [
    'supabase',
    'redis',
    'clickhouse',
    'neo4j',
    'qdrant',
    'prometheus',
    'minio',
  ]],
  ['middleware', ['dozzle', 'langfuse', 'litellm', 'zep']],
  ['apps', ['n8n', 'flowise', 'browser-use', 'openwebui', 'ollama']],
]

// Docker compose files for services with a custom Dockerfile
export const COMPOSE_BUILD_FILES = [
  isEnabled('browser-use') && [
    path.join('docker', 'docker-compose.browser-use.yml'),
    {
      // env vars to pass to build
      // browser-use has a special Dockerfile for arm64 / Mac silicon
      TARGETPLATFORM: isArm64 ? 'linux/arm64' : 'linux/amd64',
      DOCKERFILE: isArm64 ? 'Dockerfile.arm64' : 'Dockerfile',
    },
  ],
].filter(Boolean) as [string, Record<string, string>][]

// All Docker compose files
export const ALL_COMPOSE_FILES = ALL_COMPOSE_SERVICES.map(
  ([_service, file]) => file,
) as string[]

// Docker compose files for enabled services, includes build files
export const COMPOSE_FILES = ALL_COMPOSE_SERVICES.map(([service, file]) => {
  return isEnabled(service) ? file : null
})
  // Add build files
  .concat(COMPOSE_BUILD_FILES.map((arr) => arr[0] as string))
  // Remove false values and duplicates
  .filter((value, index, self) => value && self.indexOf(value) === index) as string[]

// Services that require cloning a repo
const REPO_SERVICES: Record<string, RepoService> = {
  supabase: {
    url: 'https://github.com/supabase/supabase.git',
    dir: 'supabase',
    sparseDir: 'docker',
    checkFile: 'docker/docker-compose.yml',
  },
  zep: {
    url: 'https://github.com/getzep/zep.git',
    dir: 'zep',
    checkFile: 'docker-compose.ce.yaml',
  },
  'browser-use': {
    url: 'https://github.com/browser-use/web-ui.git',
    dir: 'browser-use-web-ui',
    sparse: false,
    checkFile: 'docker-compose.yml',
  },
  // 'signoz': {
  //   url: 'https://github.com/SigNoz/signoz.git',
  //   dir: 'signoz',
  //   sparseDir: 'deploy',
  //   checkFile: 'docker-compose.yml',
  // },
}

// Volumes relative to LLEMONSTACK_VOLUMES_DIR, required by docker-compose.yml files to start services.
// These directories will be created if they don't exist.
export const REQUIRED_VOLUMES = [
  'supabase/db/data',
  'supabase/storage',
  'supabase/functions',
]

/*******************************************************************************
 * TYPES
 *******************************************************************************/

type EnvVars = Record<string, string | boolean | number>

// Custom error class for runCommand
export class CommandError extends Error {
  code: number
  stdout: string
  stderr: string
  cmd: string // the command that was run

  constructor(
    message: string,
    {
      code,
      stdout,
      stderr,
      cmd,
    }: {
      code: number
      stdout: string
      stderr: string
      cmd: string
    },
  ) {
    super(message)
    this.code = code
    this.stdout = stdout
    this.stderr = stderr
    this.cmd = cmd
  }
  override toString(): string {
    let str = this.message
    str += this.cmd ? `\nCmd: '${this.cmd}'` : ''
    str += this.stderr ? `\nError:${this.stderr}` : ''
    return str
  }
}

export interface CommandOutput {
  stdout: string
  stderr: string
  code: number
  success: boolean
  signal?: Deno.Signal | null
}

export class RunCommandOutput {
  private _output: CommandOutput
  constructor(output: CommandOutput) {
    this._output = output
  }
  get stdout(): string {
    return this._output.stdout
  }
  get stderr(): string {
    return this._output.stderr
  }
  get code(): number {
    return this._output.code
  }
  get success(): boolean {
    return this._output.success
  }
  get signal(): Deno.Signal | null | undefined {
    return this._output.signal
  }
  toString(): string {
    return this._output.stdout
  }
  toList(): string[] {
    return this._output.stdout.split('\n').filter(Boolean).map((line) => line.trim())
  }
}

export type OllamaProfile =
  | 'ollama-cpu'
  | 'ollama-gpu-amd'
  | 'ollama-gpu-nvidia'
  | 'ollama-host'
  | 'ollama-false'

export interface RepoService {
  url: string // URL of the repo
  dir: string // Name of repo dir to use in the repos folder
  sparseDir?: string | string[] // Directory to sparse clone into
  sparse?: boolean // Whether to sparse clone
  checkFile?: string // File to check for existence to determine if repo is ready
}

export interface ServiceImage {
  service: string
  containerName: string
  image: string
  build?: string
  version?: string
  imageName?: string // The name of the image without the version
}

// Define the type for the Docker Compose configuration
export interface ComposeConfig {
  include?: string | string[] | { path: string }[]
  services?: {
    [key: string]: {
      image?: string
      extends?: {
        file: string
        service?: string
      }
      build?: {
        dockerfile: string
        context?: string
        dockerfile_inline?: string
      }
      container_name?: string
    }
  }
}

/*******************************************************************************
 * FUNCTIONS
 *******************************************************************************/

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
  if (DEBUG) {
    showInfo(`[DEBUG] ${message}`)
    args?.length && args.forEach((arg) => {
      showInfo(`  ${typeof arg === 'object' ? JSON.stringify(arg) : arg}`)
    })
  }
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
export function showCredentials(username: string | null, password: string | null): void {
  username && showInfo(`  username: ${username}`)
  password && showInfo(`  password: ${password}`)
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

/**
 * Get the architecture of the system to pass to docker compose
 * @returns "linux/arm64" or "linux/amd64"
 */
export function getArch(): string {
  return Deno.build.arch === 'aarch64' ? 'linux/arm64' : 'linux/amd64'
}

/**
 * Get the host platform
 * @returns macos | linux | windows | other
 */
export function getOS(): string {
  // os: "darwin" | "linux" | "android" | "windows" | "freebsd" | "netbsd" | "aix" | "solaris" | "illumos"
  switch (Deno.build.os) {
    case 'darwin':
      return 'macos'
    case 'windows':
      return 'windows'
    case 'linux':
      return 'linux'
    default:
      return 'other'
  }
}

/**
 * Load the .env file
 *
 * TODO: replace contents of this function with loadEnv from lib/env.ts
 * during refactor. The lib version supports turning off variable expansion.
 * Just be sure to preserve the OLLAMA_HOST logic.
 *
 * If reload is false, Deno.env values will not be updated for any
 * values that were previously set. This protects against .env values
 * overwriting any values set in the command line when the script is run.
 *
 * If reload is true, all values in .env file will replace Deno.env
 * values even if they're blank in .env and already set in Deno.env.
 *
 * @param {Object} options - The options for loading the .env file
 * @param {string} options.envPath - The path to the .env file
 * @param {boolean} options.reload - Whether to reload the .env file
 * @param {boolean} options.silent - Whether to suppress output
 * @returns {Promise<Record<string, string>>} The environment variables
 */
export async function loadEnv(
  { envPath = '.env', reload = false, silent = true }: {
    envPath?: string
    reload?: boolean
    silent?: boolean
  } = {},
): Promise<Record<string, string>> {
  let envValues = {} as Record<string, string>
  if (!reload) {
    !silent && showInfo('Loading .env file')
    envValues = await loadDotEnv({ envPath, export: true })
  } else { // reload is true
    !silent && showInfo('Reloading .env file')
    envValues = await loadDotEnv({
      envPath,
      export: false, // Don't automatically export to Deno.env
    })
    // Set each variable in Deno.env
    // loadDonEnv({ export: true }) will only set variables if undefined in Deno.env
    // The reload flag sets all variables even if they are already set in Deno.env
    for (const [key, value] of Object.entries(envValues)) {
      Deno.env.set(key, value as string)
    }
  }

  //
  // Add dynamic env vars
  //
  // Set OLLAMA_HOST
  envValues.OLLAMA_HOST = getOllamaHost()
  reload && Deno.env.set('OLLAMA_HOST', envValues.OLLAMA_HOST)

  return envValues
}

/**
 * Escape special characters in a path
 * @param file - The file path to escape
 * @returns The escaped path
 */
export function escapePath(file: string): string {
  return path.normalize(file.replace(/(\s|`|\$|\\|"|&)/g, '\\$1'))
}

/**
 * Gets required environment variables to always pass to docker commands
 *
 * @param volumesDir - The directory config to use for volumes, defaults to LLEMONSTACK_VOLUMES_DIR env var value
 * @returns Record<string, string>
 */
export function dockerEnv({ volumesDir }: { volumesDir?: string } = {}): Record<string, string> {
  const volumes_dir = volumesDir || Deno.env.get('LLEMONSTACK_VOLUMES_DIR') || './volumes'
  return {
    // Convert LLEMONSTACK_VOLUMES_DIR into an absolute path to use in docker-compose.yml files
    LLEMONSTACK_VOLUMES_PATHS: path.resolve(ROOT_DIR, volumes_dir),
  }
}

export async function runCommand(
  cmd: string,
  {
    args,
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
  // Turn off silent output if DEBUG is true
  if (DEBUG) {
    silent = false
  }

  const stdout = captureOutput ? 'piped' : 'inherit'
  const stderr = stdout

  // Auto load env from .env file
  // For security, don't use all Deno.env values, only use .env file values
  const envVars = !autoLoadEnv ? {} : await loadEnv({ reload: false, silent: true })

  let cmdCmd = cmd
  let cmdArgs = (args?.filter(Boolean) || []) as string[]
  const cmdEnv: Record<string, string> = {
    ...(cmd.includes('docker') ? dockerEnv() : {}), // Add docker specific env vars
    ...envVars,
    ...Object.fromEntries( // Convert all env values to strings
      Object.entries(env).map(([k, v]) => [k, String(v)]),
    ),
  }

  // If args not provided, split out the command and args
  if (!args) {
    const parts = cmd.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g) || []
    const commandParts = parts.map((part) => part.replace(/^["']|["']$/g, ''))
    cmdCmd = commandParts[0]
    cmdArgs = commandParts.slice(1)
  }

  // Remove any surrounding quotes from arguments
  cmdArgs = cmdArgs.map((arg) => {
    if (
      (arg.startsWith('"') && arg.endsWith('"')) ||
      (arg.startsWith("'") && arg.endsWith("'"))
    ) {
      return arg.slice(1, -1)
    }
    return arg
  })

  // Save cmd for debugging & error messages
  const fullCmd = [
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join(' '),
    cmdCmd,
    cmdArgs.join(' '),
  ].filter(Boolean).join(' ')

  if (DEBUG) {
    showDebug(`Running command: ${fullCmd}`)
    // Extra debugging info, comment out when not needed
    // showDebug(`Deno.Command: ${cmdCmd}`)
    // showDebug('[args]:', cmdArgs)
    // showDebug('[env]:', cmdEnv)
  }

  const command = new Deno.Command(cmdCmd, {
    args: (cmdArgs.length && cmdArgs?.map((arg) => arg.toString())) || undefined,
    stdout,
    stderr,
    env: cmdEnv,
    // cwd,
  })

  // Spawn the command
  let process: Deno.ChildProcess | null = null
  try {
    process = command.spawn()
  } catch (error) {
    const message = `Unable to run '${cmdCmd}'`
    if (DEBUG) {
      showError(message, error)
      if (error instanceof Deno.errors.NotFound) {
        showInfo(
          `  ${cmdCmd} is either not installed or not in your PATH.\n  Please install it and try again.`,
        )
      }
    }
    throw new CommandError(message, {
      code: 1,
      cmd: fullCmd,
      stdout: '',
      stderr: String(error),
    })
  }

  // Initialize collectors for captured output if needed
  let stdoutCollector = ''
  let stderrCollector = ''
  const decoder = new TextDecoder()

  // Set up streaming for stdout
  const streamStdout = async () => {
    for await (const chunk of process.stdout) {
      const text = decoder.decode(chunk)
      if (captureOutput) {
        stdoutCollector += text
      } else {
        // Stream to console in real-time
        Deno.stdout.writeSync(chunk)
      }
    }
  }

  // Set up streaming for stderr
  const streamStderr = async () => {
    for await (const chunk of process.stderr) {
      const text = decoder.decode(chunk)
      if (captureOutput) {
        stderrCollector += text
      } else {
        // Stream to console in real-time
        Deno.stderr.writeSync(chunk)
      }
    }
  }

  // // Handle both streams and wait for process to complete
  const [status] = await Promise.all([
    process.status,
    stdout === 'piped' ? streamStdout() : Promise.resolve(),
    stderr === 'piped' ? streamStderr() : Promise.resolve(),
  ])

  if (DEBUG) {
    showDebug(`Command ${status.success ? 'completed' : 'failed'}:\n  ${fullCmd}`, status)
    if (!status.success) {
      stdout === 'piped' && showDebug(`STDOUT: ${stdoutCollector}`)
      stderr === 'piped' && showDebug(`STDERR: ${stderrCollector}`)
    }
  } else if (!silent) {
    stdoutCollector && console.log(stdoutCollector)
    stderrCollector && console.error(stderrCollector)
  }

  if (!status.success) {
    throw new CommandError(`Command failed`, {
      code: status.code,
      cmd: fullCmd,
      stdout: '',
      stderr: '',
    })
  }

  return new RunCommandOutput({
    stdout: stdoutCollector,
    stderr: stderrCollector,
    code: status.code,
    success: status.success,
    signal: status.signal,
  })
}

/**
 * Check if a service is enabled in .env file
 * @param envVar - The environment variable to check
 * @returns True if the service is enabled, false otherwise
 */
export function isEnabled(envVar: string): boolean {
  const varName = `ENABLE_${envVar.toUpperCase().replace(/-/g, '_')}`
  // Handle ollama special case
  if (envVar === 'ollama') {
    return !['ollama-false', 'ollama-host'].includes(getOllamaProfile())
  }
  const value = Deno.env.get(varName)
  // If no env var is set, default to true
  if (value === undefined || value === null) {
    return true
  }
  return (value && value.trim().toLowerCase() === 'true') as boolean
}

/**
 * Reverse looks up the compose file from the service name
 * @param service
 * @returns
 */
export async function getComposeFileFromService(service: string): Promise<string | null> {
  // Iterate through all compose files to find the service
  for (const composeFile of COMPOSE_FILES) {
    const serviceImages = await getImagesFromComposeYml(composeFile)
    const serviceImage = serviceImages.find((img) => img.service === service)
    if (serviceImage) {
      return composeFile
    }
  }
  return null
}

/**
 * Get the images from the compose file
 *
 * @param {string} composeFile - The path to the compose file
 * @param {Set<string>} [processedFiles] - Set of already processed files to avoid circular references
 * @returns {Array<ServiceImage>} An array of objects with the service name and image
 */
export async function getImagesFromComposeYml(
  composeFile: string,
  processedFiles: Set<string> = new Set(),
): Promise<Array<ServiceImage>> {
  // Return the cached images if they exist
  if (COMPOSE_IMAGES_CACHE[composeFile]) {
    return COMPOSE_IMAGES_CACHE[composeFile]
  }

  // Prevent circular references
  if (processedFiles.has(composeFile)) {
    showWarning(`Circular reference detected for ${composeFile}, skipping`)
    return []
  }
  processedFiles.add(composeFile)

  try {
    // Read the compose file
    // const fileContents = await Deno.readTextFile(composeFile)
    const fileContents = await Deno.readTextFile(composeFile)
    const composeConfig = yaml.parse(fileContents) as ComposeConfig
    const serviceImages: ServiceImage[] = []

    // Check for include directive in the compose file
    if (composeConfig.include) {
      // Handle both array and single include formats
      const includes = Array.isArray(composeConfig.include)
        ? composeConfig.include
        : [composeConfig.include]

      for (const include of includes) {
        if (typeof include === 'string') {
          // If include is a string, use it directly as the path
          const includePath = path.resolve(path.dirname(composeFile), include)
          const includedImages = await getImagesFromComposeYml(includePath, new Set(processedFiles))
          serviceImages.push(...includedImages)
        } else if (include && typeof include === 'object' && include.path) {
          // If include is an object with a path property
          const includePath = path.resolve(path.dirname(composeFile), include.path)
          const includedImages = await getImagesFromComposeYml(includePath, new Set(processedFiles))
          serviceImages.push(...includedImages)
        }
      }
    }

    // Extract service names and their image values
    if (composeConfig.services) {
      for (const serviceName in composeConfig.services) {
        const service = composeConfig.services[serviceName]
        const containerName = service?.container_name

        // Check if the service has an image directly
        if (service && service.image) {
          serviceImages.push({
            service: serviceName,
            image: service.image,
            containerName: containerName || serviceName,
          })
        } else if (service && service.build) {
          serviceImages.push({
            service: serviceName,
            image: '',
            build: service.build.dockerfile
              ? path.relative(
                ROOT_DIR,
                path.resolve(
                  path.dirname(composeFile),
                  service.build.context || '.',
                  service.build.dockerfile,
                ),
              )
              : (service.build.dockerfile_inline && `Inline Dockerfile`) ||
                service.build.toString(),
            containerName: containerName || serviceName,
          })
        }

        // Check if the service extends another service
        if (service && service.extends && service.extends.file) {
          // Resolve the path to the extended file
          const extendedFilePath = service.extends.file.startsWith('.')
            ? path.resolve(
              path.dirname(composeFile),
              service.extends.file,
            )
            : service.extends.file

          // Recursively get images from the extended file
          const extendedImages = await getImagesFromComposeYml(
            extendedFilePath,
            new Set(processedFiles),
          )

          // Find the specific service being extended
          if (service.extends.service) {
            const extendedServiceImage = extendedImages.find(
              (img) => img.service === service?.extends?.service,
            )

            if (extendedServiceImage) {
              // Only add if we don't already have an image for this service
              if (!serviceImages.some((img) => img.service === serviceName)) {
                serviceImages.push({
                  service: serviceName,
                  image: extendedServiceImage.image,
                  build: extendedServiceImage.build,
                  containerName: containerName || extendedServiceImage.containerName,
                })
              }
            }
          } else {
            // Add all images from the extended file
            serviceImages.push(...extendedImages)
          }
        }
      }
    }

    COMPOSE_IMAGES_CACHE[composeFile] = serviceImages
    return serviceImages
  } catch (error) {
    if (DEBUG) {
      showDebug(
        `Error reading compose file (${composeFile})`,
        error,
      )
    }
    throw error
  }
}

export async function getImageFromCompose(
  composeFile: string,
  service: string,
): Promise<ServiceImage | null> {
  const serviceImages = await getImagesFromComposeYml(composeFile)
  return serviceImages.find((img) => img.service === service) || null
}

export async function getComposeFile(
  service: string | undefined = undefined,
): Promise<string | null> {
  let file: string | null
  // If no service is provided, use the first "default" compose file
  if (!service) {
    file = ALL_COMPOSE_FILES[0] // docker-compose.yml
  } else {
    // Try to find the service in the compose file name
    file = ALL_COMPOSE_FILES.find((file) => file.includes(service)) || null
  }
  if (!file && service) {
    // Reverse lookup the compose file from the service name
    // This parses the actual compose files for the service
    file = await getComposeFileFromService(service)
  }
  return file
}

export function getBuildFile(
  service: string,
): [string, object] | false {
  const file = COMPOSE_BUILD_FILES.find((arr) => arr[0].includes(service))
  if (!file) {
    throw new Error(`Docker compose build file not found for ${service}`)
  }
  return file
}

export async function buildImage(
  projectName: string,
  composeFile: string,
  envVars?: Record<string, string>,
  { noCache = false }: { noCache?: boolean } = {},
): Promise<void> {
  await runCommand(
    'docker',
    {
      args: [
        'compose',
        '-p',
        projectName,
        '-f',
        composeFile,
        'build',
        noCache && '--no-cache',
      ],
      env: envVars,
    },
  )
}

/**
 * Filter out files that don't exist.
 *
 * @param files - The files to filter.
 * @returns The filtered files.
 */
export function filterExistingFiles(files: string[]): string[] {
  return files.filter((file) => {
    const exists = fs.existsSync(file)
    if (!fs.existsSync(file)) {
      showInfo(`Skipping non-existent file: ${file}`)
    }
    return exists
  })
}

export async function checkPrerequisites(): Promise<void> {
  // Commands will throw an error if the prerequisite is not installed
  await runCommand('docker --version')
  await runCommand('docker compose version')
  await runCommand('git --version')
  showInfo('✔️ All prerequisites are installed')
}

function getRepoPath(repoName: string): string {
  return escapePath(path.join(REPO_DIR, repoName))
}

/**
 * Clone a service repo into REPO_DIR
 */
async function setupRepo(
  repoName: string,
  repoUrl: string,
  repoDir: string,
  {
    sparseDir,
    sparse = true,
    pull = false, // Pull latest changes from remote
    checkFile,
  }: {
    sparseDir?: string | string[]
    sparse?: boolean
    pull?: boolean
    checkFile?: string
  } = {},
): Promise<void> {
  const dir = getRepoPath(repoDir)
  if (sparseDir) {
    sparse = true
  }

  DEBUG && showDebug(`Cloning ${repoName} repo: ${repoUrl}${sparse ? ' [sparse]' : ''}`)
  if (!fs.existsSync(dir)) {
    await runCommand('git', {
      args: [
        '-C',
        escapePath(REPO_DIR),
        'clone',
        sparse && '--filter=blob:none',
        sparse && '--no-checkout',
        repoUrl,
        repoDir,
      ],
    })

    if (sparse) {
      await runCommand('git', {
        args: [
          '-C',
          dir,
          'sparse-checkout',
          'init',
          '--cone',
        ],
      })
      if (sparseDir) {
        const sparseDirs = Array.isArray(sparseDir) ? sparseDir : [sparseDir]
        await runCommand('git', {
          args: [
            '-C',
            dir,
            'sparse-checkout',
            'set',
            ...sparseDirs,
          ],
        })
      }
      await runCommand('git', {
        args: [
          '-C',
          dir,
          'checkout',
        ],
      })
    }
  } else {
    if (pull) {
      showInfo(`${repoName} repo exists, pulling latest code...`)
      await runCommand('git', {
        args: [
          '-C',
          dir,
          'pull',
        ],
      })
    }
    // Check if the required file exists in the repo
    if (checkFile) {
      const checkFilePath = path.join(dir, checkFile)
      if (!await fs.exists(checkFilePath)) {
        const errMsg = `Required file ${checkFile} not found in ${repoName} directory: ${dir}`
        showWarning(errMsg)
        showUserAction(`Please check the repository structure and try again.`)
        throw new Error(errMsg)
      }
    }
    showInfo(`✔️ ${repoName} repo is ready`)
  }
}

/**
 * Setup enabled services that require cloning a repo
 * @param pull - Pull latest changes from remote
 * @param all - Setup all repos
 */
export async function setupRepos({
  pull = false,
  all = false,
}: {
  pull?: boolean
  all?: boolean
} = {}): Promise<void> {
  // Ensure .repos directory exists
  try {
    await fs.ensureDir(REPO_DIR)
  } catch (error) {
    showError(`Unable to create repos dir: ${REPO_DIR}`, error)
    Deno.exit(1)
  }
  // Setup all repos in parallel
  await Promise.all(
    Object.entries(REPO_SERVICES)
      .map(([service, { url, dir, sparseDir, sparse, checkFile }]) => {
        if (!all && !isEnabled(service)) {
          return false
        }
        return setupRepo(service, url, dir, { sparseDir, sparse, pull, checkFile })
      })
      .filter(Boolean),
  )
  showInfo(`${all ? 'All repositories' : 'Repositories'} are ready`)
}

/**
 * Copy .env and docker/config.supabase.env contents to .env in the supabase repo
 */
export async function prepareSupabaseEnv(): Promise<void> {
  // Check if the supabase repo directory exists
  // It contains the root docker-compose.yml file to start supabase services
  const supabaseRepoDir = getRepoPath('supabase')
  if (!fs.existsSync(supabaseRepoDir)) {
    // Try to fix the issue by cloning all the repos
    showInfo(`Supabase repo not found: ${supabaseRepoDir}`)
    showInfo('Attempting to repair the repos...')
    await setupRepos({ all: true })
    if (!fs.existsSync(supabaseRepoDir)) {
      showError('Supabase repo still not found, unable to continue')
      Deno.exit(1)
    }
  }

  // Location of the .env file in the directory of the override docker-compose.yml file.
  // docker/supabase/
  // Docker auto loads this .env file to populate environment variables in the supabase docker-compose.yml files.
  const supabaseEnv = escapePath(
    path.join('docker', 'supabase', '.env'),
  )
  // The config.supabase.env file contains most of the base environment variables
  // for the supabase docker-compose.yml. The rest are in the root .env
  const configEnv = path.join('docker', 'supabase', 'config.supabase.env')

  // Copy config.supabase.env to docker/supabase/.env,
  // then append the contents of the root .env file.
  // The contents of config.supabase.env take precedence over .env.
  // Env file loaders use the first defined value in an .env file
  await Deno.copyFile(configEnv, supabaseEnv)
  const envContent = await Deno.readTextFile(ENVFILE)
  await Deno.writeTextFile(supabaseEnv, envContent, { append: true })

  // Also copy the .env to supabase repo in case the original supabase docker-compose.yml
  // is used instead of the custom override docker-compose.yml file.
  await Deno.copyFile(supabaseEnv, path.join(supabaseRepoDir, 'docker', '.env'))
}

/**
 * Create volumes dirs required by docker-compose.yml files
 *
 * Uses LLEMONSTACK_VOLUMES_DIR env var to determine the path to the
 * base volumes directory.
 *
 * If the volumes directory does not exist, it will be created.
 *
 * If the volumes directory exists, but is not a directory, an error will be thrown.
 */
async function createRequiredVolumes({ silent = false }: { silent?: boolean } = {}): Promise<void> {
  if (DEBUG) {
    silent = false
  }

  const volumesPath = dockerEnv().LLEMONSTACK_VOLUMES_PATHS

  !silent && showInfo('Checking for required volumes...')
  DEBUG && showDebug(`Volumes base path: ${volumesPath}`)

  for (const volume of REQUIRED_VOLUMES) {
    const volumePath = path.join(volumesPath, volume)
    try {
      const fileInfo = await Deno.stat(volumePath)
      if (fileInfo.isDirectory) {
        DEBUG && showDebug(`✔️ ${volume}`)
      } else {
        throw new Error(`Volume is not a directory: ${volumePath}`)
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        await Deno.mkdir(volumePath, { recursive: true })
        !silent && showInfo(`Created missing volume dir: ${volumePath}`)
      } else {
        throw error
      }
    }
  }
  !silent && showInfo(`All required volumes exist`)
}

/**
 * Call this function before running any other scripts
 */
export async function prepareEnv({ silent = false }: { silent?: boolean } = {}): Promise<void> {
  !silent && showInfo('Preparing environment...')

  if (!fs.existsSync(ENVFILE)) {
    showError('Error: .env file not found')
    showUserAction(
      'Please create a .env file in the root directory and try again.',
    )
    Deno.exit(1)
  }

  // Create volumes dirs required by docker-compose.yml files
  await createRequiredVolumes({ silent })

  // Prepare the custom supabase .env file needed for the supabase docker-compose.yml file
  await prepareSupabaseEnv()

  !silent && showInfo('✔️ Supabase environment successfully setup')
}

/**
 * Get the profiles command for docker compose as array to pass to runCommand
 * @param all - Whether to use all profiles
 * @returns The profiles command
 */
export function getProfilesArgs({
  all = false,
  profiles,
}: {
  all?: boolean
  profiles?: string[]
} = {}): string[] {
  const profilesList = all ? [`"*"`] : profiles || []
  return profilesList.map((profile) => ['--profile', profile]).flat()
}

export function getOllamaProfile(): OllamaProfile {
  return `ollama-${Deno.env.get('ENABLE_OLLAMA')?.trim() || 'false'}` as OllamaProfile
}

export function getOllamaHost(): string {
  const host = (getOllamaProfile() === 'ollama-host') ? 'host.docker.internal' : 'ollama'
  return `${host}:11434`
}

async function startBrowserUse(projectName: string): Promise<void> {
  const buildFile = getBuildFile('browser-use')
  if (!buildFile) {
    throw new Error('Browser-use build file not found')
  }
  const composeFile = buildFile[0]
  const imageName = `${projectName}-browser-use-webui`
  const envVars = buildFile[1] as Record<string, string>

  let imageExists = false

  try {
    // Check if browser-use image already exists
    const imageCheckResult = (await runCommand(`docker images ${imageName}`, {
      captureOutput: true,
      silent: true,
    })).toString()
    imageExists = imageCheckResult.includes(imageName)
  } catch (error) {
    showError(`Error checking for browser-use image`, error)
  }

  if (imageExists) {
    showAction(`Browser-use image exists, skipping build`)
  } else {
    showAction(
      `Browser-use image not found, building. This will take a while...`,
    )
  }

  // Build the image if it doesn't exist
  !imageExists && (await buildImage(projectName, composeFile, envVars))

  await startService(projectName, 'browser-use', { envVars })
}

/**
 * Check if supabase was started by any of the services that depend on it
 * @param projectName
 */
export async function isSupabaseStarted(projectName: string): Promise<boolean> {
  const result = (await runCommand('docker', {
    args: [
      'ps',
      '-a',
      '--filter',
      `label=com.docker.compose.project=${projectName}`,
    ],
    captureOutput: true,
    silent: true,
  })).toString()
  return (result.includes('supabase')) as boolean
}

export async function startService(
  projectName: string,
  service: string,
  { envVars = {}, profiles }: { envVars?: EnvVars; profiles?: string[] } = {},
) {
  const composeFile = await getComposeFile(service)
  if (!composeFile) {
    throw new Error(`Docker compose file not found for ${service}: ${composeFile}`)
  }
  await runCommand('docker', {
    args: [
      'compose',
      '-p',
      projectName,
      ...getProfilesArgs({ profiles }),
      '-f',
      composeFile,
      'up',
      '-d',
    ].filter(Boolean),
    env: {
      'COMPOSE_IGNORE_ORPHANS': true,
      ...envVars,
    },
    silent: true,
  })
}

/**
 * Start multiple services at the same time
 *
 * @param projectName - The project name
 * @param services - The services to start
 * @param envVars - The environment variables
 * @param composeFiles - The compose files to use
 */
export async function startServices(
  projectName: string,
  services: string[],
  { envVars = {} }: { envVars?: EnvVars } = {},
) {
  const composeFiles = await Promise.all(services.map(async (service) => {
    const composeFile = await getComposeFile(service)
    if (!composeFile) {
      throw new Error(`Docker compose file not found for ${service}: ${composeFile}`)
    }
    return composeFile
  }))
  await runCommand('docker', {
    args: [
      'compose',
      '-p',
      projectName,
      ...composeFiles.map((file) => ['-f', file]).flat(),
      'up',
      '-d',
    ].filter(Boolean),
    env: {
      'COMPOSE_IGNORE_ORPHANS': true,
      ...envVars,
    },
    silent: true,
  })
}

export async function isInitialized(): Promise<boolean> {
  try {
    await Deno.stat(LLEMONSTACK_CONFIG_FILE)
    return true
  } catch (_error) {
    return false
  }
}

export async function start(projectName: string): Promise<void> {
  try {
    if (!await isInitialized()) {
      showWarning('Project not initialized', '❌')
      showUserAction('\nPlease run the init script first: deno run init')
      Deno.exit(1)
    }

    showAction('Checking prerequisites...')
    await checkPrerequisites()
    showAction('Setting up repositories...')
    await setupRepos()
    showAction('Setting up environment...')
    await prepareEnv({ silent: false })

    // Start services by group
    for (const [groupName, groupServices] of SERVICE_GROUPS) {
      const enabledGroupServices = groupServices.filter((service) =>
        isEnabled(service) &&
        ALL_COMPOSE_SERVICES.find(([s, _, autoRun]) => s === service && autoRun)
      )
      if (enabledGroupServices.length > 0) {
        showAction(`\nStarting ${groupName} services...`)
        await startServices(projectName, enabledGroupServices)
      }
    }

    // Special handling for browser-use
    if (isEnabled('browser-use')) {
      showAction(`\nStarting browser-use...`)
      await startBrowserUse(projectName)
    }

    // Special handling for Ollama
    const ollamaProfile = getOllamaProfile()
    if (ollamaProfile !== 'ollama-false') {
      showAction(`\nStarting Ollama...`)
      if (ollamaProfile === 'ollama-host') {
        showInfo('Using host Ollama, no need to start ollama service')
      } else {
        await startService(projectName, 'ollama', { profiles: [ollamaProfile] })
      }
    }

    // Check if supabase was started by any of the services that depend on it
    const supabaseStarted = await isSupabaseStarted(projectName)

    showAction('\nAll services started successfully!')

    //
    // SERVICE DASHBOARDS
    //
    showHeader('Service Dashboards')
    isEnabled('n8n') && showService('n8n', 'http://localhost:5678')
    if (isEnabled('flowise')) {
      showService('Flowise', 'http://localhost:3001')
      showCredentials(
        Deno.env.get('FLOWISE_USERNAME') || '',
        Deno.env.get('FLOWISE_PASSWORD') || '',
      )
    }
    isEnabled('openwebui') && showService('Open WebUI', 'http://localhost:8080')
    if (isEnabled('browser-use')) {
      showService('Browser-Use', 'http://localhost:7788/')
      showService(
        'Browser-Use VNC',
        'http://0.0.0.0:6080/vnc.html?host=0.0.0.0&port=6080',
      )
      showCredentials(null, Deno.env.get('BROWSER_USE_VNC_PASSWORD') || null)
    }
    if (supabaseStarted) {
      showService('Supabase', `http://localhost:8000`)
      showCredentials(
        Deno.env.get('SUPABASE_DASHBOARD_USERNAME') || '',
        Deno.env.get('SUPABASE_DASHBOARD_PASSWORD') || '',
      )
    }
    if (isEnabled('litellm')) {
      showService('LiteLLM', 'http://localhost:3004/ui/')
      showCredentials(
        Deno.env.get('LITELLM_UI_USERNAME') || '',
        Deno.env.get('LITELLM_UI_PASSWORD') || '',
      )
    }
    if (isEnabled('langfuse')) {
      showService('Langfuse', 'http://localhost:3005/')
      showCredentials(
        Deno.env.get('LANGFUSE_INIT_USER_EMAIL') || '',
        Deno.env.get('LANGFUSE_INIT_USER_PASSWORD') || '',
      )
    }
    if (isEnabled('neo4j')) {
      showService('Neo4j', 'http://localhost:7474/browser/')
      showCredentials(
        Deno.env.get('NEO4J_USER') || '',
        Deno.env.get('NEO4J_PASSWORD') || '',
      )
    }
    isEnabled('qdrant') && showService('Qdrant', 'http://localhost:6333/dashboard')
    if (isEnabled('minio')) {
      showService('Minio', 'http://localhost:9091/')
      showCredentials(
        'minio',
        Deno.env.get('MINIO_ROOT_PASSWORD') || '',
      )
    }
    isEnabled('dozzle') && showService('Dozzle', 'http://localhost:8081/')

    //
    // API ENDPOINTS
    //
    showHeader('API Endpoints')
    showInfo('Use these endpoints to configure services in the stack, e.g. n8n credentials.')
    showInfo(
      'You can also test the endpoints on your host matching by replacing the domain with `localhost`',
    )
    isEnabled('n8n') && showService('n8n', 'http://n8n:5678')
    isEnabled('flowise') && showService('Flowise', 'http://flowise:3001')
    if (supabaseStarted) {
      showService('Supabase Postgres DB (host:port)', 'db:5432')
      showService('Supabase API', 'http://kong:8000')
      showService(
        'Supabase Edge Functions',
        'http://kong:8000/functions/v1/hello',
      )
    }
    // TODO: show LiteLLM API key: sk-***
    // TODO: create a new LiteLLM API key in init script or on first run?
    isEnabled('litellm') && showService('LiteLLM', 'http://litellm:4000')
    if (isEnabled('zep')) {
      showService('Zep', 'http://zep:8000')
      showService('Zep Graphiti', 'http://graphiti:8003')
    }
    isEnabled('neo4j') && showService('Neo4j', 'bolt://neo4j:7687')
    isEnabled('qdrant') && showService('Qdrant', 'http://qdrant:6333')
    isEnabled('redis') && showService('Redis', 'http://redis:6379')
    isEnabled('clickhouse') && showService('Clickhouse', 'http://clickhouse:8123')
    isEnabled('langfuse') && showService('Langfuse', 'http://langfuse:3000')
    isEnabled('minio') && showService('Minio', 'http://minio:9000/')

    // Show any user actions
    // Show user action if using host Ollama
    if (ollamaProfile === 'ollama-host') {
      const ollamaUrl = 'http://host.docker.internal:11434'
      showService('Ollama', ollamaUrl)
      showUserAction(`\nUsing host Ollama: ${colors.yellow(ollamaUrl)}`)
      showUserAction('  Start ollama on your computer: `ollama serve`')
      isEnabled('n8n') && showUserAction(`  -> n8n: set ollama credential url to: ${ollamaUrl}`)
    } else if (isEnabled('ollama')) {
      showService('Ollama', 'http://ollama:11434')
    }

    console.log('\n')
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  start(Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME)
}
