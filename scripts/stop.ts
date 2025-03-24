#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Stop the stack by downing docker containers and cleaning up networks.
 */

import {
  dockerComposePs,
  type DockerComposePsResult,
  getDockerNetworks,
  removeDockerNetwork,
  runDockerCommand,
  runDockerComposeCommand,
} from './lib/docker.ts'
import { showAction, showError, showInfo } from './lib/logger.ts'
import {
  ALL_COMPOSE_SERVICES,
  type ComposeService,
  DEFAULT_PROJECT_NAME,
  getComposeFile,
  isEnabled,
  prepareEnv,
  setupRepos,
} from './start.ts'

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

async function stopServices(
  projectName: string,
  composeServices: ComposeService[],
  { all = false }: { all?: boolean } = {},
): Promise<void> {
  // Stop all services in parallel
  await Promise.all(composeServices.map(async ([service]) => {
    await stopService(projectName, service)
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
      composeFile = await getComposeFile(service)
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
  projectName: string,
  { all = false, service }: { all?: boolean; service?: string } = {},
): Promise<void> {
  let stopAll = all
  let composeService: ComposeService | undefined
  if (service) {
    stopAll = false
    composeService = ALL_COMPOSE_SERVICES.find(([s]) => s === service)
    if (!composeService) {
      showError(`Unknown service: ${service}`)
      showAction('\nAvailable services:')
      ALL_COMPOSE_SERVICES.forEach(([service]) => {
        if (isEnabled(service)) {
          showInfo(`- ${service}`)
        }
      })
      Deno.exit(1)
    }
  }

  if (service) {
    showAction(`Stopping service: ${service}...`)
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

  if (service) {
    await stopService(projectName, service)
  } else {
    const services = ALL_COMPOSE_SERVICES.filter(([service]) => {
      return stopAll || isEnabled(service)
    })
    await stopServices(projectName, services, { all: stopAll })
  }

  showAction('Cleaning up networks...')
  if (stopAll) {
    await removeAllNetworks(projectName)
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

// Run script if this file is executed directly
if (import.meta.main) {
  stop(Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME, {
    all: Deno.args.includes('--all'),
    service: Deno.args.find((arg) => !arg.startsWith('--')),
  })
}
