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
import {
  dockerEnv,
  isServiceRunning,
  prepareDockerNetwork,
  replaceDockerComposeVars,
} from './lib/docker.ts'
import { getFlowiseApiKey } from './lib/flowise.ts'
import { CommandError, runCommand } from './lib/runCommand.ts'
import {
  ComposeConfig,
  Config,
  EnvVars,
  OllamaProfile,
  RepoService,
  ServiceImage,
} from './lib/types.d.ts'

// Immediately load .env file
await loadEnv({ silent: true })

// Get version from package.json
export const LLEMONSTACK_INSTALL_DIR = path.join(
  path.dirname(path.fromFileUrl(import.meta.url)),
  '../',
)
const packageJson = JSON.parse(
  Deno.readTextFileSync(path.join(LLEMONSTACK_INSTALL_DIR, 'package.json')),
)
export const VERSION = packageJson.version

export const ENVFILE = path.join(Deno.cwd(), '.env')

/*******************************************************************************
 * CONFIG
 *******************************************************************************/

// Project name for docker compose
export const DEFAULT_PROJECT_NAME = 'llemonstack'

// Enable extra debug logging
export const DEBUG = Deno.env.get('LLEMONSTACK_DEBUG')?.toLowerCase() === 'true'

// TODO: refactor all config to call getConfig instead of using global vars
export const CONFIG = await getConfig({ autoCreate: true })

// Directory used to git clone repositories: supabase, zep, etc.
// TODO: remove this and replace with a better sanity check in reset.ts
export const REPO_DIR_BASE = path.basename(CONFIG.dirs.repos)

export const IMPORT_DIR_BASE = CONFIG.dirs.import

export const ROOT_DIR = Deno.cwd()

export const LLEMONSTACK_CONFIG_DIR = path.resolve(ROOT_DIR, CONFIG.dirs.config)
export const LLEMONSTACK_CONFIG_FILE = path.join(LLEMONSTACK_CONFIG_DIR, 'config.json')

export const REPO_DIR = escapePath(path.resolve(ROOT_DIR, CONFIG.dirs.repos))
export const SHARED_DIR = escapePath(path.resolve(ROOT_DIR, CONFIG.dirs.shared))
export const COMPOSE_IMAGES_CACHE = {} as Record<string, ServiceImage[]>

// All services with a docker-compose.yaml file
// Includes services with a custom Dockerfile
// [service name, compose file, auto run]
// When auto run is true, the service is started automatically if enabled.
// When auto run is false, the service needs to be started manually.
export type ComposeService = [string, string, boolean]
export const ALL_COMPOSE_SERVICES: ComposeService[] = [
  ['supabase', path.join('services', 'supabase', 'docker-compose.yaml'), true],
  ['n8n', path.join('services', 'n8n', 'docker-compose.yaml'), true],
  ['flowise', path.join('services', 'flowise', 'docker-compose.yaml'), true],
  ['neo4j', path.join('services', 'neo4j', 'docker-compose.yaml'), true],
  ['zep', path.join('services', 'zep', 'docker-compose.yaml'), true],
  ['browser-use', path.join('services', 'browser-use', 'docker-compose.yaml'), true], // Uses a custom start function
  ['qdrant', path.join('services', 'qdrant', 'docker-compose.yaml'), true],
  ['openwebui', path.join('services', 'openwebui', 'docker-compose.yaml'), true],
  ['ollama', path.join('services', 'ollama', 'docker-compose.yaml'), false], // Uses a custom start function
  ['prometheus', path.join('services', 'prometheus', 'docker-compose.yaml'), true],
  ['redis', path.join('services', 'redis', 'docker-compose.yaml'), true],
  ['clickhouse', path.join('services', 'clickhouse', 'docker-compose.yaml'), true],
  ['minio', path.join('services', 'minio', 'docker-compose.yaml'), true],
  ['langfuse', path.join('services', 'langfuse', 'docker-compose.yaml'), true],
  ['litellm', path.join('services', 'litellm', 'docker-compose.yaml'), true],
  ['dozzle', path.join('services', 'dozzle', 'docker-compose.yaml'), true],
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

// All Docker compose files
export const ALL_COMPOSE_FILES = ALL_COMPOSE_SERVICES.map(
  ([_service, file]) => file,
) as string[]

// Docker compose files for enabled services, includes build files
export const COMPOSE_FILES = ALL_COMPOSE_SERVICES.map(([service, file]) => {
  return isEnabled(service) ? file : null
})
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
// If seed: Copy these dirs or files into volumes if they don't exist
const REQUIRED_VOLUMES = [
  { volume: 'supabase/db/data' },
  { volume: 'supabase/storage' },
  {
    volume: 'supabase/functions',
    seed: [ // Copy these dirs into functions volumes if they don't exist
      {
        source: path.join(getRepoPath('supabase'), 'docker', 'volumes', 'functions', 'main'),
        destination: 'main', // Relative to the volume path
      },
      {
        source: path.join(getRepoPath('supabase'), 'docker', 'volumes', 'functions', 'hello'),
        destination: 'hello',
      },
    ],
  },
  { volume: 'flowise/config' },
  { volume: 'flowise/uploads' },
  { volume: 'minio' },
]

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
  // Uses existing env var if set, otherwise configures based on ENABLE_OLLAMA settings
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

// /**
//  * Gets required environment variables to always pass to docker commands
//  *
//  * @param volumesDir - The directory config to use for volumes, defaults to LLEMONSTACK_VOLUMES_DIR env var value
//  * @returns Record<string, string>
//  */
// export function dockerEnv({ volumesDir }: { volumesDir?: string } = {}): Record<string, string> {
//   return {
//     LLEMONSTACK_VOLUMES_PATH: getVolumesPath(volumesDir),
//     LLEMONSTACK_SHARED_VOLUME_PATH: path.resolve(ROOT_DIR, CONFIG.dirs.shared),
//     LLEMONSTACK_IMPORT_VOLUME_PATH: path.resolve(ROOT_DIR, CONFIG.dirs.import),
//     LLEMONSTACK_REPOS_PATH: REPO_DIR,
//     LLEMONSTACK_NETWORK_NAME: `${Deno.env.get('LLEMONSTACK_PROJECT_NAME')}_network`,
//     TARGETPLATFORM: getDockerTargetPlatform(), // Docker platform for building images
//     DOCKERFILE_ARCH: getDockerfileArch(), // Dockerfile.arm64 if on Mac Silicon or aarch64 platform
//   }
// }

/**
 * Get the absolute path to the volumes directory
 * @param volumesDir - The directory config to use for volumes, defaults to LLEMONSTACK_VOLUMES_DIR env var value
 * @returns The absolute path to the volumes directory
 */
export function getVolumesPath(volumesDir?: string) {
  // Convert LLEMONSTACK_VOLUMES_DIR into an absolute path to use in docker-compose.yaml files
  const volumes_dir = volumesDir || Deno.env.get('LLEMONSTACK_VOLUMES_DIR') || './volumes'
  return path.resolve(ROOT_DIR, volumes_dir)
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

  // Expand any variables in the compose file path
  if (composeFile.includes('${')) {
    composeFile = replaceDockerComposeVars(composeFile, dockerEnv())
  }

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
    file = ALL_COMPOSE_FILES[0] // docker-compose.yaml
  } else {
    // Try to find the service in the compose file name
    file = ALL_COMPOSE_FILES.find((file) => file.includes(service)) || null
  }
  if (!file && service) {
    // Reverse lookup the compose file from the service name
    // This parses the actual compose files for the service
    file = await getComposeFileFromService(service)
  }
  return file ? path.join(LLEMONSTACK_INSTALL_DIR, file) : null
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
    if (!exists) {
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
    silent = false,
  }: {
    sparseDir?: string | string[]
    sparse?: boolean
    pull?: boolean
    checkFile?: string
    silent?: boolean
  } = {},
): Promise<void> {
  const dir = getRepoPath(repoDir)
  if (sparseDir) {
    sparse = true
  }
  if (DEBUG) {
    silent = false
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
      !silent && showInfo(`${repoName} repo exists, pulling latest code...`)
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
    !silent && showInfo(`✔️ ${repoName} repo is ready`)
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
  silent = false,
}: {
  pull?: boolean
  all?: boolean
  silent?: boolean
} = {}): Promise<void> {
  // Ensure repos directory exists
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
        return setupRepo(service, url, dir, { sparseDir, sparse, pull, checkFile, silent })
      })
      .filter(Boolean),
  )
  !silent && showInfo(`${all ? 'All repositories' : 'Repositories'} are ready`)
}

export async function getConfig(
  {
    projectName = DEFAULT_PROJECT_NAME || 'llemonstack',
    autoCreate = false,
    silent = false,
    version = VERSION,
    configFile = '',
    configDir = '',
  }: {
    projectName?: string
    autoCreate?: boolean
    silent?: boolean
    version?: string
    configFile?: string
    configDir?: string
  } = {},
): Promise<Config> {
  if (DEBUG) {
    silent = false
  }
  if (!configDir) {
    configDir = configDir || ('LLEMONSTACK_CONFIG_DIR' in globalThis && LLEMONSTACK_CONFIG_DIR)
      ? LLEMONSTACK_CONFIG_DIR
      : '.llemonstack'
  }
  if (!configFile) {
    configFile = path.join(configDir, 'config.json')
  }

  let config: Config
  if (!fs.existsSync(configFile)) {
    if (autoCreate) {
      try {
        config = await getConfigTemplate(version, { silent })
      } catch (error) {
        showError(`Unable to find config template for version: ${version}`, error)
        showUserAction(
          `Please update LLemonStack and try again, or create a custom config file here: ${configFile}`,
        )
        Deno.exit(1)
      }
      config.projectName = projectName
      config.initialized = ''
      await saveConfigFile(config)
    } else {
      throw new Error(`Config file not found: ${configFile}`)
    }
  }
  config = JSON.parse(await Deno.readTextFile(configFile)) as Config

  // Migrate from 0.1.0 timestamp
  if (!config.initialized && config.timestamp) {
    config.initialized = config.timestamp
    delete config.timestamp
    await saveConfigFile(config)
  }

  // Ensure all required dirs are present
  if (
    !config?.dirs?.config || !config?.dirs?.repos || !config?.dirs?.import ||
    !config?.dirs?.shared || !config?.dirs?.volumes
  ) {
    const template = await getConfigTemplate(config.version, { silent })
    config.dirs = {
      ...template.dirs,
      ...config.dirs,
    }
    await saveConfigFile(config)
  }

  return config
}

async function getConfigTemplate(
  version: string,
  { silent = false }: { silent?: boolean } = {},
): Promise<Config> {
  if (!fs.existsSync(LLEMONSTACK_INSTALL_DIR)) {
    throw new Error(`LLemonStack install dir not found: ${LLEMONSTACK_INSTALL_DIR}`)
  }
  const _getFile = (version: string): string | false => {
    const file = path.join(LLEMONSTACK_INSTALL_DIR, 'config', `config.${version}.json`)
    return fs.existsSync(file) ? file : false
  }
  let file = await _getFile(version)
  if (!file) {
    file = await _getFile(VERSION)
    !silent && showWarning(`Unable to find config template for version: ${version}: ${file}`)
  }
  if (!file) {
    throw new Error(`Config template file not found: ${file}`)
  }
  const config = JSON.parse(await Deno.readTextFile(file)) as Config
  return config
}

export async function saveConfigFile(
  config: Config,
  { configFile, configDir }: { configFile?: string; configDir?: string } = {},
): Promise<string> {
  if (!configFile) {
    if (!configDir) {
      configDir = configDir || ('LLEMONSTACK_CONFIG_DIR' in globalThis && LLEMONSTACK_CONFIG_DIR)
        ? LLEMONSTACK_CONFIG_DIR
        : '.llemonstack'
    }
    await fs.ensureDir(configDir)
    configFile = path.join(configDir, 'config.json')
  }
  await fs.ensureDir(path.dirname(configFile))
  await Deno.writeTextFile(
    configFile,
    JSON.stringify(config, null, 2),
  )
  return configFile
}

/**
 * Copy .env and docker/config.supabase.env contents to .env in the supabase repo
 */
export async function prepareSupabaseEnv(
  { silent = false }: { silent?: boolean } = {},
): Promise<void> {
  // Check if the supabase repo directory exists
  // It contains the root docker-compose.yaml file to start supabase services
  const supabaseRepoDir = getRepoPath('supabase')
  if (!fs.existsSync(supabaseRepoDir)) {
    // Try to fix the issue by cloning all the repos
    !silent && showInfo(`Supabase repo not found: ${supabaseRepoDir}`)
    !silent && showInfo('Attempting to repair the repos...')
    await setupRepos({ all: true, silent })
    if (!fs.existsSync(supabaseRepoDir)) {
      showError('Supabase repo still not found, unable to continue')
      Deno.exit(1)
    }
  }
}

/**
 * Create volumes dirs required by docker-compose.yaml files
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

  const volumesPath = dockerEnv().LLEMONSTACK_VOLUMES_PATH

  !silent && showInfo('Checking for required volumes...')
  DEBUG && showDebug(`Volumes base path: ${volumesPath}`)

  for (const volume of REQUIRED_VOLUMES) {
    const volumePath = path.join(volumesPath, volume.volume)
    try {
      const fileInfo = await Deno.stat(volumePath)
      if (fileInfo.isDirectory) {
        DEBUG && showDebug(`✔️ ${volume.volume}`)
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
    if (volume.seed) {
      for (const seed of volume.seed) {
        const seedPath = path.join(volumePath, seed.destination)
        try {
          // Check if seedPath already exists before copying
          const seedPathExists = await fs.exists(seedPath)
          if (seedPathExists) {
            DEBUG && showDebug(`Volume seed already exists: ${getRelativePath(seedPath)}`)
            continue
          }
          await fs.copy(seed.source, seedPath, { overwrite: false })
          !silent &&
            showInfo(`Copied ${getRelativePath(seed.source)} to ${getRelativePath(seedPath)}`)
        } catch (error) {
          showError(
            `Error copying seed: ${getRelativePath(seed.source)} to ${getRelativePath(seedPath)}`,
            error,
          )
        }
      }
    }
  }
  !silent && showInfo(`All required volumes exist`)
}

function getRelativePath(pathStr: string): string {
  return path.relative(Deno.cwd(), pathStr)
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

  // Prepare the custom supabase .env file needed for the supabase docker-compose.yaml file
  await prepareSupabaseEnv({ silent })

  // Create volumes dirs required by docker-compose.yaml files
  await createRequiredVolumes({ silent })

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
  // Use the OLLAMA_HOST env var if it is set, otherwise check Ollama profile settings
  const host = Deno.env.get('OLLAMA_HOST') || (getOllamaProfile() === 'ollama-host')
    ? 'host.docker.internal:11434'
    : 'ollama:11434'
  return host
}

/**
 * Check if supabase was started by any of the services that depend on it
 * @param projectName
 */
export async function isSupabaseStarted(projectName: string): Promise<boolean> {
  return await isServiceRunning('supabase', { projectName })
}

export async function startService(
  projectName: string,
  service: string,
  { envVars = {}, profiles, createNetwork = true }: {
    envVars?: EnvVars
    profiles?: string[]
    createNetwork?: boolean
  } = {},
) {
  if (createNetwork) {
    await prepareDockerNetwork()
  }

  const composeFile = await getComposeFile(service)
  if (!composeFile) {
    throw new Error(`Docker compose file not found for ${service}: ${composeFile}`)
  }
  await runCommand('docker', {
    args: [
      'compose',
      '--ansi',
      'never',
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
    silent: false,
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
  // Create the network if it doesn't exist
  await prepareDockerNetwork()

  // Start all services in parallel
  await Promise.all(services.map(async (service) => {
    try {
      await startService(projectName, service, { envVars, createNetwork: false })
    } catch (error) {
      showError(`Failed to start service ${service}:`, error)
      throw error
    }
  }))
}

export async function isInitialized(): Promise<boolean> {
  try {
    const config = await getConfig()
    return !!config.initialized.trim()
  } catch (_error) {
    return false
  }
}

async function outputServicesInfo({
  projectName,
  ollamaProfile,
}: {
  projectName: string
  ollamaProfile: string
}): Promise<void> {
  //
  // SERVICE DASHBOARDS
  //
  showHeader('Service Dashboards')
  showInfo('Access the dashboards in a browser on your host machine.\n')
  isEnabled('n8n') && showService('n8n', 'http://localhost:5678')
  if (isEnabled('flowise')) {
    showService('Flowise', 'http://localhost:3001')
    showCredentials({
      'Username': Deno.env.get('FLOWISE_USERNAME'),
      'Password': Deno.env.get('FLOWISE_PASSWORD'),
    })
  }
  isEnabled('openwebui') && showService('Open WebUI', 'http://localhost:8080')
  if (isEnabled('browser-use')) {
    showService('Browser-Use', 'http://localhost:7788/')
    showService(
      'Browser-Use VNC',
      'http://0.0.0.0:6080/vnc.html?host=0.0.0.0&port=6080',
    )
    showCredentials({
      'Password': Deno.env.get('BROWSER_USE_VNC_PASSWORD'),
    })
  }
  if (isEnabled('supabase')) {
    showService('Supabase', `http://localhost:8000`)
    showCredentials({
      'Username': Deno.env.get('SUPABASE_DASHBOARD_USERNAME'),
      'Password': Deno.env.get('SUPABASE_DASHBOARD_PASSWORD'),
    })
  }
  if (isEnabled('litellm')) {
    showService('LiteLLM', 'http://localhost:3004/ui/')
    showCredentials({
      'Username': Deno.env.get('LITELLM_UI_USERNAME'),
      'Password': Deno.env.get('LITELLM_UI_PASSWORD'),
    })
  }
  if (isEnabled('langfuse')) {
    showService('Langfuse', 'http://localhost:3005/')
    showCredentials({
      'Username': Deno.env.get('LANGFUSE_INIT_USER_EMAIL'),
      'Password': Deno.env.get('LANGFUSE_INIT_USER_PASSWORD'),
    })
  }
  if (isEnabled('neo4j')) {
    showService('Neo4j', 'http://localhost:7474/browser/')
    showCredentials({
      'Username': Deno.env.get('NEO4J_USER'),
      'Password': Deno.env.get('NEO4J_PASSWORD'),
    })
  }
  isEnabled('qdrant') && showService('Qdrant', 'http://localhost:6333/dashboard')
  if (isEnabled('minio')) {
    showService('Minio', 'http://localhost:9091/')
    showCredentials({
      'Username': 'minio',
      'Password': Deno.env.get('MINIO_ROOT_PASSWORD'),
    })
  }
  isEnabled('dozzle') && showService('Dozzle', 'http://localhost:8081/')

  //
  // API ENDPOINTS
  //
  showHeader('API Endpoints')
  showInfo('For connecting services within the stack, use the following endpoints.')
  showInfo('i.e. for n8n credentials, postgres connections, API requests, etc.\n')

  if (isEnabled('supabase')) {
    showService('Supabase Postgres DB Host', 'db')
    showCredentials({
      'Username': 'postgres',
      'Password': Deno.env.get('POSTGRES_PASSWORD'),
    })
    showService('Supabase Postgres Pooler', 'supavisor')
    showCredentials({
      'Username': `postgres.${projectName}`,
      'Password': Deno.env.get('POSTGRES_PASSWORD'),
    })
    showInfo('Use the pooler for postgres connections whenever possible.')
    showInfo(
      `PSQL Connection URL: postgres://postgres.${projectName}:${
        Deno.env.get('POSTGRES_PASSWORD')
      }@supavisor:5432/postgres`,
    )
    console.log('')
    showService('Supabase API', 'http://kong:8000')
    showService(
      'Supabase Edge Functions',
      'http://kong:8000/functions/v1/[function]',
    )
  }
  isEnabled('n8n') && showService('n8n', 'http://n8n:5678')
  if (isEnabled('flowise')) {
    showService('Flowise', 'http://flowise:3000')
    const flowiseApi = await getFlowiseApiKey()
    showCredentials({
      [flowiseApi?.keyName || 'API Key']: flowiseApi?.apiKey || '',
    })
  }
  if (isEnabled('litellm')) {
    showService('LiteLLM', 'http://litellm:4000')
    showCredentials({
      'API Key': Deno.env.get('LITELLM_MASTER_KEY'),
    })
  }
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
    showUserAction('  Start Ollama on your computer: `ollama serve`')
    if (isEnabled('n8n')) {
      showUserAction(`  Set n8n Ollama credential url to: ${ollamaUrl}`)
      showUserAction(
        `  Or connect n8n to LiteLLM http://litellm:4000 to proxy requests to Ollama`,
      )
    }
  } else if (isEnabled('ollama')) {
    showService('Ollama', 'http://ollama:11434')
  }
  console.log('\n')
}

export async function start(
  projectName: string,
  { service, skipOutput = false }: { service?: string; skipOutput?: boolean } = {},
): Promise<void> {
  if (service && !isEnabled(service)) {
    showWarning(`${service} is not enabled`)
    showInfo(
      `Set ENABLE_${service.toUpperCase().replaceAll('-', '_')} to true in .env to enable it`,
    )
    return
  }
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

    // Start services
    if (service) {
      // Start a single service
      await startService(projectName, service)
    } else {
      // Start all services by service group
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
    }

    // Special handling for Ollama
    const ollamaProfile = getOllamaProfile()
    if (ollamaProfile !== 'ollama-false' && !service || service === 'ollama') {
      showAction(`\nStarting Ollama...`)
      if (ollamaProfile === 'ollama-host') {
        showInfo('Using host Ollama, no need to start ollama service')
      } else {
        await startService(projectName, 'ollama', { profiles: [ollamaProfile] })
      }
    }

    if (service) {
      showAction(`\n${service} started successfully!`)
    } else {
      showAction('\nAll services started successfully!')
    }

    if (!skipOutput) {
      await outputServicesInfo({
        projectName,
        ollamaProfile,
      })
    }
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  // Check if script was called with a service argument
  const service = Deno.args.find((arg) => !arg.startsWith('--'))
  await start(Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME, {
    service,
  })
}
