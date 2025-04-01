/**
 * Start docker services
 */

import { Config } from '@/core/config/config.ts'
import { runCommand } from '@/lib/command.ts'
import { prepareDockerNetwork } from '@/lib/docker.ts'
import {
  Cell,
  colors,
  Column,
  Row,
  RowType,
  showAction,
  showError,
  showHeader,
  showInfo,
  showLogMessages,
  showService,
  showTable,
  showUserAction,
  showWarning,
} from '@/lib/logger.ts'
import { EnvVars, ExposeHost, ServicesMapType, ServiceType } from '@/types'

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

// TODO: update API and all references to startService
export async function startService(
  config: Config,
  serviceOrName: ServiceType | string,
  { envVars = {}, profiles: _profiles, createNetwork = true }: {
    envVars?: EnvVars
    profiles?: string[]
    createNetwork?: boolean
  } = {},
): Promise<ServiceType> {
  if (createNetwork) {
    await prepareDockerNetwork(config.dockerNetworkName)
  }

  const service = (typeof serviceOrName === 'string')
    ? config.getServiceByName(serviceOrName)
    : serviceOrName
  if (!service) {
    throw new Error(`Service not found: ${serviceOrName}`)
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
  return service
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
  config: Config,
  services: ServicesMapType,
  { envVars = {} }: { envVars?: EnvVars } = {},
) {
  // Create the network if it doesn't exist
  await prepareDockerNetwork(config.dockerNetworkName)

  // Start all services in parallel
  await Promise.all(services.filterMap(async (service) => {
    try {
      await startService(config, service, { envVars, createNetwork: false })
    } catch (error) {
      showError(`Failed to start service ${service}:`, error)
      throw error
    }
  }))
}

function showServicesInfo(
  services: ServicesMapType,
  hostContext: string,
  { hideCredentials = false }: { hideCredentials?: boolean } = {},
) {
  // Sort services by name
  services.toArray().sort((a, b) => a.name.localeCompare(b.name))
  const rows: RowType[] = []
  services.forEach((service) => {
    const hosts = service.getEndpoints(hostContext)
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
  config,
  hideCredentials = false,
}: {
  config: Config
  hideCredentials?: boolean
}): void {
  const services = config.getEnabledServices()
  if (!services.size) {
    showWarning('No services are enabled')
    return
  }

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
  const ollamaService = config.getServiceByName('ollama')
  if (ollamaService?.getProfiles()[0] === 'ollama-host') {
    const ollamaUrl = config.getServiceByName('ollama')?.getHostEndpoint()?.url || ''
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
  config: Config,
  { service: serviceOrName, skipOutput = false, hideCredentials = true }: {
    service?: string | ServiceType
    skipOutput?: boolean
    hideCredentials?: boolean
  } = {},
): Promise<void> {
  // Check if config is old format and re-run configure script if needed
  // if (config.isOutdatedConfig()) {
  //   showWarning('Config is outdated, re-running configure script...')
  //   await configure(projectName)
  // }
  let service: ServiceType | null = null

  if (serviceOrName) {
    service = (typeof serviceOrName === 'string')
      ? config.getServiceByName(serviceOrName)
      : serviceOrName
  }

  if (service && !service.isEnabled()) {
    showWarning(`${service.name} is not enabled`)
    return
  }
  try {
    if (!config.isProjectInitialized()) {
      showWarning('Project not initialized', '❌')
      showUserAction('\nPlease run the init script first: llmn init')
      Deno.exit(1)
    }

    showAction('Checking prerequisites...')
    await checkPrerequisites()

    showAction('Setting up environment...')
    await config.prepareEnv() // TODO: check for errors and show them

    // Start services
    if (service) {
      // Start a single service
      await startService(config, service)
    } else {
      // Start all services by service group
      for (const [groupName, groupServices] of config.getServicesGroups()) {
        const enabledGroupServices = groupServices.filter((service: ServiceType) =>
          service.isEnabled()
        )
        if (enabledGroupServices.size > 0) {
          showAction(`\nStarting ${groupName} services...`)
          await startServices(config, enabledGroupServices)
        }
      }
    }

    // Special handling for Ollama
    const ollamaService = config.getServiceByName('ollama')
    const ollamaProfile = ollamaService?.getProfiles()[0]
    // TODO: fix this, doesn't seem correct
    if (ollamaProfile !== 'ollama-false' && !service || service?.service === 'ollama') {
      showAction(`\nStarting Ollama...`)
      if (ollamaProfile === 'ollama-host') {
        showInfo('Using host Ollama, no need to start ollama service')
      } else {
        await startService(config, 'ollama', { profiles: [ollamaProfile || ''] })
      }
    }

    if (service) {
      showAction(`\n${service} started successfully!`)
    } else {
      showAction('\nAll services started successfully!')
    }

    if (!skipOutput) {
      await outputServicesInfo({
        config,
        hideCredentials,
      })
    }
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}
