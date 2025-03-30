/**
 * Stop the stack by downing docker containers and cleaning up networks.
 */

import { Config, ServicesMap } from '@/core/index.ts'
import {
  dockerComposePs,
  type DockerComposePsResult,
  getDockerNetworks,
  removeDockerNetwork,
  runDockerCommand,
} from '@/lib/docker.ts'
import { colors, RowType, showAction, showError, showInfo, showTable } from '@/lib/logger.ts'
import { ServicesMapType, ServiceType } from '@/types'
import { prepareEnv, setupRepos } from './start.ts'

const config = Config.getInstance()
await config.initialize()

async function removeAllNetworks(projectName: string): Promise<void> {
  const MAX_RETRIES = 3
  const RETRY_DELAY_MS = 2000

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Remove all networks for project
      const networks = await getDockerNetworks({ projectName })
      if (networks.length > 0) {
        await removeDockerNetwork(networks, { silent: true })
      } else {
        break
      }
    } catch (error) {
      showError(error)
      showAction(
        `Retrying removing networks, attempt ${attempt + 1}/${MAX_RETRIES}...`,
      )
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
}

/**
 * Stop all services in parallel
 * @param projectName - The name of the project
 * @param services - A ServicesMap or an array of service names
 * @param all - Whether to stop all services
 */
async function stopServices(
  config: Config,
  servicesOrNames: ServicesMapType | string[],
  { all = false }: { all?: boolean } = {},
): Promise<void> {
  let services: ServicesMapType

  if (servicesOrNames instanceof ServicesMap) {
    services = servicesOrNames
  } else {
    services = config.getServicesByNames(servicesOrNames)
    // Check for invalid services
    const missingServices = services.missingServices(servicesOrNames)
    if (missingServices.length > 0) {
      showError(`Unknown services: ${missingServices.join(', ')}`)
      Deno.exit(1)
    }
  }

  // Stop all services in parallel
  // TODO: search for all Promise.all to make sure it use's this example
  // instead of Promise.all(async (service) => { await ...})
  // The extra async is not needed as it wraps an additional promise for no reason
  await Promise.all(
    services.toArray().map((service) => stopService(service)),
  )

  // Return early if not stopping all services
  if (!all) return

  // Clean up all containers for the project
  // This is necessary when .env settings are changed and the above docker compose
  // commands did not catch all running containers.
  try {
    // Get containers separated by newlines
    const containers = await dockerComposePs(config.projectName) as DockerComposePsResult
    if (containers.length > 0) {
      showAction(`Removing ${containers.length} containers that didn't stop properly...`)
      showInfo(`Containers:\n${containers.map((c) => `- ${c.Name}`).join('\n')}`)
      await runDockerCommand('rm', {
        args: ['-f', ...containers.map((c) => c.ID as string)],
        silent: true,
      })
    }
  } catch (error) {
    showError('Error removing containers', error)
  }
  showAction('All services stopped')
}

/**
 * Stop a single service
 * Does not remove orphans.
 * @param {Service} service - The service to stop
 */
// TODO: verify this works
export async function stopService(
  service: ServiceType,
): Promise<void> {
  showAction(`Stopping ${service.name}...`)

  const result = await service.stopService()

  if (result.success) {
    showAction(`${service.name} stopped`)
  } else {
    showError(`Error stopping ${service.name}`, result)
  }
}

export async function stop(
  config: Config,
  { all = false, service: serviceName }: { all?: boolean; service?: string } = {},
): Promise<void> {
  let stopAll = all

  const service = serviceName ? config.getServiceByName(serviceName) : undefined

  if (serviceName && !service) {
    stopAll = false
    if (!service) {
      showError(`Unknown service: '${serviceName}'`)
      showAction('\nAvailable services:\n')

      const rows = config.getAllServices().toArray().map((_service) => {
        return [colors.green(_service.service), _service.description]
      }).filter(Boolean) as RowType[]

      showTable(['Service', 'Description'], rows, { maxColumnWidth: 100 })
      Deno.exit(1)
    }
  }

  if (service) {
    stopAll = false
  }

  if (stopAll) {
    showAction(`Stopping all services for project: ${config.projectName}...`)
  } else {
    showAction(`Stopping enabled services for project: ${config.projectName}...`)
  }

  await prepareEnv({ config, silent: false })

  // Make sure repos are all available in case any services need them
  try {
    // TODO: move this to Services class to auto handle repo setup
    await setupRepos({ config, all: true, pull: false })
  } catch (error) {
    showError('Unable to setup repos, docker compose down may fail', error)
  }

  if (service) {
    await stopService(service)
  } else {
    const services = stopAll ? config.getAllServices() : config.getEnabledServices()
    await stopServices(config, services, { all: stopAll })
  }

  showAction('Cleaning up networks...')
  if (stopAll) {
    await removeAllNetworks(config.projectName)
  }
  await runDockerCommand('network', {
    args: ['prune', '-f'],
    silent: true,
  })

  if (service) {
    showAction(`Service ${service} stopped`)
  } else if (stopAll) {
    showAction('All services stopped')
  } else {
    showAction('Enabled services stopped')
  }
}
