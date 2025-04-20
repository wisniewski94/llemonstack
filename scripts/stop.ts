/**
 * Stop the stack by downing docker containers and cleaning up networks.
 */

import { dockerComposePs, type DockerComposePsResult, runDockerCommand } from '@/lib/docker.ts'
import { colors, RowType, showTable } from '@/relayer/ui/show.ts'
import { ServicesMapType, ServiceType } from '@/types'
import { Config, ServicesMap } from '../src/core/mod.ts'

async function removeAllNetworks(config: Config): Promise<void> {
  const show = config.relayer.show
  const MAX_RETRIES = 3
  const RETRY_DELAY_MS = 2000

  // Try to remove the network up to MAX_RETRIES times
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await config.cleanupDockerNetwork({ silent: true })
    if (result.success) {
      break
    } else {
      show.error('Failed to remove networks', { error: result.error })
      show.action(
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
  const show = config.relayer.show
  let services: ServicesMapType

  if (servicesOrNames instanceof ServicesMap) {
    services = servicesOrNames
  } else {
    services = config.getServicesByNames(servicesOrNames)
    // Check for invalid services
    const missingServices = services.missingServices(servicesOrNames)
    if (missingServices.length > 0) {
      show.error(`Unknown services: ${missingServices.join(', ')}`)
      Deno.exit(1)
    }
  }

  // Stop all services in parallel
  await Promise.all(
    services.toArray().map((service) => stopService(config, service)),
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
      show.action(`Removing ${containers.length} containers that didn't stop properly...`)
      show.info(`Containers:\n${containers.map((c) => `- ${c.Name}`).join('\n')}`)
      await runDockerCommand('rm', {
        args: ['-f', ...containers.map((c) => c.ID as string)],
        silent: true,
      })
    }
  } catch (error) {
    show.error('Error removing containers', { error })
  }
  show.action('All services stopped')
}

/**
 * Stop a single service
 * Does not remove orphans.
 * @param {Service} service - The service to stop
 */
async function stopService(
  config: Config,
  service: ServiceType,
): Promise<void> {
  const show = config.relayer.show
  show.action(`Stopping ${service.name}...`)

  const result = await service.stop()

  if (result.success) {
    show.info(`✔️ ${service.name} stopped`)
  } else {
    show.error(`Error stopping ${service.name}`, { error: result })
  }
}

export async function stop(
  config: Config,
  { all = false, service: serviceName }: { all?: boolean; service?: string } = {},
): Promise<void> {
  const show = config.relayer.show
  let stopAll = all

  const service = serviceName ? config.getServiceByName(serviceName) : undefined

  if (serviceName && !service) {
    stopAll = false
    if (!service) {
      show.error(`Unknown service: '${serviceName}'`)
      show.action('\nAvailable services:\n')

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
    show.action(`Stopping all services for project: ${config.projectName}...`)
  } else {
    show.action(`Stopping enabled services for project: ${config.projectName}...`)
  }

  // Wait for env to be prepared before stopping services in parallel
  const prepareResult = await config.prepareEnv()
  if (!prepareResult.success) {
    show.logMessages(prepareResult.messages)
    Deno.exit(1)
  }

  if (service) {
    await stopService(config, service)
  } else {
    const services = stopAll ? config.getAllServices() : config.getEnabledServices()
    await stopServices(config, services, { all: stopAll })
  }

  if (stopAll) {
    await removeAllNetworks(config)
  }
  await runDockerCommand('network', {
    args: ['prune', '-f'],
    silent: true,
  })
  show.info('✔️ Networks cleaned up')
}
