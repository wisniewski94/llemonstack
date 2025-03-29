/**
 * Stop the stack by downing docker containers and cleaning up networks.
 */

import { Config } from './lib/core/config/config.ts'
import {
  dockerComposePs,
  type DockerComposePsResult,
  getDockerNetworks,
  removeDockerNetwork,
  runDockerCommand,
  runDockerComposeCommand,
} from './lib/docker.ts'
import { colors, RowType, showAction, showError, showInfo, showTable } from './lib/logger.ts'
import { Service } from './lib/types.d.ts'
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
 * @param services - The services names to stop
 * @param all - Whether to stop all services
 */
async function stopServices(
  projectName: string,
  services: (Service | string)[],
  { all = false }: { all?: boolean } = {},
): Promise<void> {
  // Get service names from Service objects
  const serviceNames = services.map((_service) =>
    typeof _service === 'object' ? _service.service : _service
  )

  // Stop all services in parallel
  await Promise.all(serviceNames.map(async (serviceName) => {
    await stopService(projectName, serviceName)
  }))

  // Return early if not stopping all services
  if (!all) return

  // Clean up all containers for the project
  // This is necessary when .env settings are changed and the above docker compose
  // commands did not catch all running containers.
  try {
    // Get containers separated by newlines
    const containers = await dockerComposePs(projectName) as DockerComposePsResult
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
 * @param projectName - The name of the project
 * @param composeFile - The path to the compose file
 * @param service - The name of the service to stop
 */
export async function stopService(
  projectName: string,
  service: string,
  { composeFile }: { composeFile?: string | null } = {},
): Promise<void> {
  try {
    if (!composeFile) {
      composeFile = config.getComposeFile(service)
    }
    if (!composeFile) {
      throw new Error(`No compose file found for service: ${service}`)
    }
    showAction(`Stopping ${service}...`)
    const result = await runDockerComposeCommand('down', {
      composeFile,
      projectName,
      silent: true,
      captureOutput: true,
    })
    if (result.success) {
      showAction(`${service} stopped`)
    } else {
      showError(`Error stopping ${service}`, result.stderr)
    }
  } catch (error) {
    showError(`Error stopping ${service}`, error)
  }
}

export async function stop(
  config: Config
  { all = false, service: serviceName }: { all?: boolean; service?: string } = {},
): Promise<void> {
  let stopAll = all

  const service = serviceName ? config.getService(serviceName) : undefined

  if (serviceName && !service) {
    stopAll = false
    if (!service) {
      showError(`Unknown service: '${serviceName}'`)
      showAction('\nAvailable services:\n')
      const rows = config.getAllServices().map((_service) => {
        if (_service && config.isEnabled(name)) {
          return [colors.green(_service.service), _service.description]
        }
        return false
      }).filter(Boolean) as RowType[]
      showTable(['Service', 'Description'], rows, { maxColumnWidth: 100 })
      Deno.exit(1)
    }
  }

  if (serviceName) {
    showAction(`Stopping service: ${serviceName}...`)
  } else if (stopAll) {
    showAction('Stopping all services...')
  } else {
    showAction('Stopping enabled services...')
  }

  await prepareEnv({ silent: false })

  // Make sure repos are all available in case any services need them
  try {
    await setupRepos({ all: true, pull: false })
  } catch (error) {
    showError('Unable to setup repos, docker compose down may fail', error)
  }

  if (serviceName) {
    await stopService(config.projectName, serviceName)
  } else {
    const services = stopAll ? config.getAllServices() : config.getEnabledServices()
    await stopServices(config.projectName, services, { all: stopAll })
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
