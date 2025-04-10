/**
 * Start docker services
 */

import { Config } from '@/core/config/config.ts'
import { runCommand } from '@/lib/command.ts'
import { prepareDockerNetwork } from '@/lib/docker.ts'
import { Cell, colors, Column, Row, RowType, showTable } from '@/relayer/ui/show.ts'
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
  console.log('✔️ All prerequisites are installed')
}

// TODO: update API and all references to startService
export async function startService(
  config: Config,
  serviceOrName: ServiceType | string,
  { envVars = {}, profiles: _profiles, createNetwork = true, build = false }: {
    envVars?: EnvVars
    profiles?: string[]
    createNetwork?: boolean
    build?: boolean
  } = {},
): Promise<ServiceType> {
  const show = config.relayer.show

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

  const result = await service.start({ envVars, silent: false, build })
  if (!result.success) {
    show.error('Service failed to start', { error: result.error || new Error('Unknown error') })
  }
  show.logMessages(result.messages)
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
  { envVars = {}, build = false, createNetwork = true }: {
    envVars?: EnvVars
    build?: boolean
    createNetwork?: boolean
  } = {},
) {
  const show = config.relayer.show

  if (createNetwork) {
    // Create the network if it doesn't exist
    await prepareDockerNetwork(config.dockerNetworkName)
  }

  // Start all services in parallel
  await Promise.all(services.filterMap(async (service) => {
    try {
      await startService(config, service, { envVars, createNetwork: false, build })
    } catch (error) {
      show.error(`Failed to start service ${service}:`, { error })
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
  const show = config.relayer.show
  const services = config.getEnabledServices()
  if (!services.size) {
    show.warn('No services are enabled')
    return
  }

  show.header('Service Dashboards')
  show.info('Access the dashboards in a browser on your host machine.\n')

  showServicesInfo(services, 'host.*', { hideCredentials })

  show.header('API Endpoints')
  show.info('For connecting services within the stack, use the following endpoints.')
  show.info('i.e. for n8n credentials, postgres connections, API requests, etc.\n')

  showServicesInfo(services, 'internal.*', { hideCredentials })

  // Show additional info for each service
  // See OllamaService for an example
  services.forEach((service) => {
    service.showAdditionalInfo({ show, config })
  })

  console.log('\n')
}

export async function start(
  config: Config,
  { service: serviceOrName, skipOutput = false, hideCredentials = true, build = false }: {
    service?: string | ServiceType
    skipOutput?: boolean
    hideCredentials?: boolean
    build?: boolean
  } = {},
): Promise<void> {
  const show = config.relayer.show

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
    show.warn(`${service.name} is not enabled`)
    return
  }
  try {
    if (!config.isProjectInitialized()) {
      show.warn('Project not initialized', { emoji: '❌' })
      show.userAction('\nPlease run the init script first: llmn init')
      Deno.exit(1)
    }

    show.action('Checking prerequisites...')
    await checkPrerequisites()

    show.action('Setting up environment...')
    await config.prepareEnv() // TODO: check for errors and show them

    // Start services
    if (service) {
      // Start a single service
      await startService(config, service, { build, createNetwork: false })
    } else {
      // Start all services by service group
      for (const [groupName, groupServices] of config.getServicesGroups()) {
        const enabledGroupServices = groupServices.filter((service: ServiceType) =>
          service.isEnabled()
        )
        if (enabledGroupServices.size > 0) {
          show.action(`\nStarting ${groupName} services...`)
          await startServices(config, enabledGroupServices, { build, createNetwork: false })
        }
      }
    }

    if (service) {
      show.action(`\n${service} started successfully!`)
    } else {
      show.action('\nAll services started successfully!')
    }

    if (!skipOutput) {
      await outputServicesInfo({
        config,
        hideCredentials,
      })
    }
  } catch (error) {
    show.error('Failed to start services', { error })
    Deno.exit(1)
  }
}
