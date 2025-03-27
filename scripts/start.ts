/**
 * Start docker services
 */

import { runCommand } from './lib/command.ts'
import { Config } from './lib/config.ts'
import { isServiceRunning, prepareDockerNetwork } from './lib/docker.ts'
import { escapePath, fs, path } from './lib/fs.ts'
import {
  Cell,
  colors,
  Column,
  Row,
  RowType,
  showAction,
  showDebug,
  showError,
  showHeader,
  showInfo,
  showLogMessages,
  showService,
  showTable,
  showUserAction,
  showWarning,
} from './lib/logger.ts'
import { EnvVars, ExposeHost, RepoService, Service } from './lib/types.d.ts'

const config = Config.getInstance()
await config.initialize()

// Enable extra debug logging
const DEBUG = config.DEBUG

/*******************************************************************************
 * FUNCTIONS
 *******************************************************************************/

/**
 * Check if all prerequisites are installed
 */
export async function checkPrerequisites(): Promise<void> {
  // Commands will throw an error if the prerequisite is not installed
  await runCommand('docker --version')
  await runCommand('docker compose version')
  await runCommand('git --version')
  showInfo('✔️ All prerequisites are installed')
}

/**
 * Clone a service repo into repo dir
 */
async function setupRepo(
  serviceName: string,
  repoConfig: RepoService,
  {
    pull = false, // Pull latest changes from remote
    silent = false,
  }: {
    pull?: boolean
    silent?: boolean
  } = {},
): Promise<void> {
  const dir = config.getService(serviceName)?.repoDir
  if (!dir) {
    throw new Error(`Repo dir not found for ${serviceName}`)
  }
  if (repoConfig.sparseDir) {
    repoConfig.sparse = true
  }
  if (DEBUG) {
    silent = false
  }

  DEBUG &&
    showDebug(
      `Cloning ${serviceName} repo: ${repoConfig.url}${repoConfig.sparse ? ' [sparse]' : ''}`,
    )
  if (!fs.existsSync(dir)) {
    await runCommand('git', {
      args: [
        '-C',
        escapePath(config.repoDir),
        'clone',
        repoConfig.sparse && '--filter=blob:none',
        repoConfig.sparse && '--no-checkout',
        repoConfig.url,
        repoConfig.dir,
      ],
    })

    if (repoConfig.sparse) {
      await runCommand('git', {
        args: [
          '-C',
          dir,
          'sparse-checkout',
          'init',
          '--cone',
        ],
      })
      if (repoConfig.sparseDir) {
        const sparseDirs = Array.isArray(repoConfig.sparseDir)
          ? repoConfig.sparseDir
          : [repoConfig.sparseDir]
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
      !silent && showInfo(`${serviceName} repo exists, pulling latest code...`)
      await runCommand('git', {
        args: [
          '-C',
          dir,
          'pull',
        ],
      })
    }
    // Check if the required file exists in the repo
    if (repoConfig.checkFile) {
      const checkFilePath = path.join(dir, repoConfig.checkFile)
      if (!await fs.exists(checkFilePath)) {
        const errMsg =
          `Required file ${repoConfig.checkFile} not found in ${serviceName} directory: ${dir}`
        showWarning(errMsg)
        showUserAction(`Please check the repository structure and try again.`)
        throw new Error(errMsg)
      }
    }
    !silent && showInfo(`✔️ ${serviceName} repo is ready`)
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
    await fs.ensureDir(config.repoDir)
  } catch (error) {
    showError(`Unable to create repos dir: ${config.repoDir}`, error)
    Deno.exit(1)
  }

  // Setup all repos in parallel
  await Promise.all(
    config.getServicesWithRepos()
      .map((service) => {
        if (!all && !config.isEnabled(service.service)) {
          return false
        }
        return service.repoConfig &&
          setupRepo(service.service, service.repoConfig, { pull, silent })
      })
      .filter(Boolean),
  )
  !silent && showInfo(`${all ? 'All repositories' : 'Repositories'} are ready`)
}

/**
 * Copy .env and docker/config.supabase.env contents to .env in the supabase repo
 */
export async function prepareSupabaseEnv(
  { silent = false }: { silent?: boolean } = {},
): Promise<void> {
  // Check if the supabase repo directory exists
  // It contains the root docker-compose.yaml file to start supabase services
  const supabaseRepoDir = config.getService('supabase')?.repoDir
  if (!supabaseRepoDir) {
    showError('Supabase repo dir is misconfigured')
    Deno.exit(1)
  }
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
 * If the volumes directory does not exist, it will be created.
 *
 * If the volumes directory exists, but is not a directory, an error will be thrown.
 */
async function createRequiredVolumes({ silent = false }: { silent?: boolean } = {}): Promise<void> {
  if (DEBUG) {
    silent = false
  }

  const volumesPath = config.volumesDir

  !silent && showInfo('Checking for required volumes...')
  DEBUG && showDebug(`Volumes base path: ${volumesPath}`)

  const getRelativePath = (pathStr: string): string => {
    return path.relative(Deno.cwd(), pathStr)
  }

  const services = config.getServicesWithRequiredVolumes()

  for (const service of services) {
    // Create any required volume dirs
    for (const volume of service.volumes) {
      const volumePath = path.join(config.volumesDir, volume)
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

    // Copy any seed directories if needed
    for (const seed of service.volumesSeeds) {
      const seedPath = path.join(config.volumesDir, seed.destination)
      try {
        // Check if seedPath already exists before copying
        const seedPathExists = await fs.exists(seedPath)
        if (seedPathExists) {
          DEBUG && showDebug(`Volume seed already exists: ${getRelativePath(seedPath)}`)
          continue
        }
        let seedSource = seed.source
        if (seed.from_repo && service.repoDir) {
          seedSource = path.join(service.repoDir, seed.source)
        } else {
          throw new Error(`Volume seed requires repo to exist: ${seed.source}`)
        }
        await fs.copy(seedSource, seedPath, { overwrite: false })
        !silent &&
          showInfo(`Copied ${getRelativePath(seedSource)} to ${getRelativePath(seedPath)}`)
      } catch (error) {
        showError(
          `Error copying seed: ${getRelativePath(seed.source)} to ${getRelativePath(seedPath)}`,
          error,
        )
      }
    }
  }

  !silent && showInfo(`All required volumes exist`)
}

/**
 * Call this function before running any other scripts
 */
// TODO: move to config
export async function prepareEnv({ silent = false }: { silent?: boolean } = {}): Promise<void> {
  !silent && showInfo('Preparing environment...')

  if (!fs.existsSync(config.envFile)) {
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
// TODO: move to config or remove altogether
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

/**
 * Check if supabase was started by any of the services that depend on it
 * @param projectName
 */
export async function isSupabaseStarted(projectName: string): Promise<boolean> {
  return await isServiceRunning('supabase', { projectName, match: 'partial' })
}

// TODO: update API and all references to startService
export async function startService(
  _projectName: string,
  serviceName: string,
  // deno-lint-ignore no-unused-vars
  { envVars = {}, profiles, createNetwork = true }: {
    envVars?: EnvVars
    profiles?: string[]
    createNetwork?: boolean
  } = {},
) {
  if (createNetwork) {
    await prepareDockerNetwork()
  }

  const service = config.getService(serviceName)
  if (!service) {
    throw new Error(`Invalid service name, unable to start: ${serviceName}`)
  }

  const composeFile = service?.composeFile
  if (!composeFile) {
    throw new Error(`Docker compose file not found for ${service}: ${composeFile}`)
  }

  const result = await service.start({ envVars, silent: false })
  if (!result.success) {
    showError(result.error)
  }
  showLogMessages(result.messages)
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

export function isInitialized(): boolean {
  return config.projectInitialized
}

function showServicesInfo(
  services: Service[],
  hostContext: string,
  { hideCredentials = false }: { hideCredentials?: boolean } = {},
) {
  // Sort services by name
  services.sort((a, b) => a.name.localeCompare(b.name))
  const rows: RowType[] = []
  services.forEach((service) => {
    const hosts = service.getHosts(hostContext)
    hosts?.forEach((host: ExposeHost) => {
      const name = ['api', 'dashboard'].includes((host.name || '').trim().toLowerCase())
        ? `${service.name} ${host.name}`
        : host.name || service.name

      let numCredentials = 0
      const credentials = host.credentials
        ? Object.entries(host.credentials).map(([k, v]) => {
          numCredentials++
          return `${colors.gray(k)}: ${colors.brightBlue(hideCredentials ? '********' : v)}`
        }).join('\n')
        : ''

      rows.push(
        Row.from([
          colors.green(name),
          colors.yellow(host.url),
          colors.gray(numCredentials > 0 ? service.service : ''),
          new Cell(credentials),
        ]),
      )
      if (host.info) {
        rows.push([
          undefined,
          new Cell(colors.gray(host.info || '')).colSpan(3).align('left'),
        ])
      }
    })
  })
  const table = showTable(['Service', 'URL', '', 'Credentials'], rows, {
    maxColumnWidth: 0,
    render: false,
  })
  table
    .column(0, new Column().align('right'))
    .column(2, new Column().align('right'))
    .render()
}

function outputServicesInfo({
  hideCredentials = false,
}: {
  hideCredentials?: boolean
}): void {
  const services = config.getEnabledServices()

  showHeader('Service Dashboards')
  showInfo('Access the dashboards in a browser on your host machine.\n')

  showServicesInfo(services, 'host.*', { hideCredentials })

  showHeader('API Endpoints')
  showInfo('For connecting services within the stack, use the following endpoints.')
  showInfo('i.e. for n8n credentials, postgres connections, API requests, etc.\n')

  showServicesInfo(services, 'internal.*', { hideCredentials })

  // TODO: migrate additional ollama info to service subclass
  // Show any user actions
  // Show user action if using host Ollama
  const ollamaService = config.getService('ollama')
  if (ollamaService?.getProfiles()[0] === 'ollama-host') {
    const ollamaUrl = config.getService('ollama')?.getHost()?.url || ''
    // showService('Ollama', ollamaUrl)
    showUserAction(`\nUsing host Ollama: ${colors.yellow(ollamaUrl)}`)
    showUserAction('  Start Ollama on your computer: `ollama serve`')
    if (config.isEnabled('n8n')) {
      showUserAction(`  Set n8n Ollama credential url to: ${ollamaUrl}`)
      showUserAction(
        `  Or connect n8n to LiteLLM http://litellm:4000 to proxy requests to Ollama`,
      )
    }
  } else if (config.isEnabled('ollama')) {
    showService('Ollama', 'http://ollama:11434')
  }
  console.log('\n')
}

export async function start(
  projectName: string,
  { service, skipOutput = false, hideCredentials = true }: {
    service?: string
    skipOutput?: boolean
    hideCredentials?: boolean
  } = {},
): Promise<void> {
  // Check if config is old format and re-run configure script if needed
  // if (config.isOutdatedConfig()) {
  //   showWarning('Config is outdated, re-running configure script...')
  //   await configure(projectName)
  // }

  if (service && !config.isEnabled(service)) {
    showWarning(`${service} is not enabled`)
    showInfo(
      `Set ENABLE_${service.toUpperCase().replaceAll('-', '_')} to true in .env to enable it`,
    )
    return
  }
  try {
    if (!isInitialized()) {
      showWarning('Project not initialized', '❌')
      showUserAction('\nPlease run the init script first: llmn init')
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
      for (const [groupName, groupServices] of config.getServiceGroups()) {
        const enabledGroupServices = groupServices.filter((service) => config.isEnabled(service))
        if (enabledGroupServices.length > 0) {
          showAction(`\nStarting ${groupName} services...`)
          await startServices(projectName, enabledGroupServices)
        }
      }
    }

    // Special handling for Ollama
    const ollamaService = config.getService('ollama')
    const ollamaProfile = ollamaService?.getProfiles()[0]
    if (ollamaProfile !== 'ollama-false' && !service || service === 'ollama') {
      showAction(`\nStarting Ollama...`)
      if (ollamaProfile === 'ollama-host') {
        showInfo('Using host Ollama, no need to start ollama service')
      } else {
        await startService(projectName, 'ollama', { profiles: [ollamaProfile || ''] })
      }
    }

    if (service) {
      showAction(`\n${service} started successfully!`)
    } else {
      showAction('\nAll services started successfully!')
    }

    if (!skipOutput) {
      await outputServicesInfo({
        hideCredentials,
      })
    }
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}
