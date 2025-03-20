#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Stop the stack by downing docker containers and cleaning up networks.
 *
 * Usage:
 *
 * ```bash
 * deno run stop
 *
 * # Stop all services regardless of ENABLED status
 * deno run stop --all
 * ```
 */

import {
  ALL_COMPOSE_FILES,
  ALL_COMPOSE_SERVICES,
  COMPOSE_FILES,
  type ComposeService,
  DEFAULT_PROJECT_NAME,
  filterExistingFiles,
  getComposeFile,
  getProfilesArgs,
  prepareEnv,
  runCommand,
  setupRepos,
  showAction,
  showError,
} from './start.ts'

async function removeAllNetworks(projectName: string): Promise<void> {
  const MAX_RETRIES = 3
  const RETRY_DELAY_MS = 2000

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Remove all networks for project
      const networks = (await runCommand(
        `docker network ls --filter label=com.docker.compose.project=${projectName} --format "{{.ID}}"`,
        { captureOutput: true },
      )).toList()
      if (networks.length > 0) {
        await runCommand(
          `docker network rm -f ${networks}`,
          { silent: true },
        )
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
  composeFiles: string[],
  { all = false }: { all?: boolean } = {},
): Promise<void> {
  try {
    await runCommand('docker', {
      args: [
        'compose',
        '-p',
        projectName,
        ...composeFiles.map((file) => ['-f', file]).flat(),
        ...getProfilesArgs({ all }),
        'down',
        '--remove-orphans',
      ],
    })
  } catch (error) {
    showError('Error during docker compose down', error)
  }

  // Return early if not stopping all services
  if (!all) return

  // Clean up all containers for the project
  // This is necessary when .env settings are changed and the above docker compose
  // command did not catch all running containers.
  try {
    // Get containers separated by newlines
    const containers = (await runCommand(
      `docker ps -aq --filter label=com.docker.compose.project=${projectName}`,
      { captureOutput: true },
    )).toList()
    if (containers.length > 0) {
      await runCommand(`docker rm -f ${containers.join(' ')}`, {
        silent: true,
      })
    }
  } catch (error) {
    showError('Error removing containers', error)
  }
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
    await runCommand('docker', {
      args: [
        'compose',
        '-p',
        projectName,
        '-f',
        composeFile,
        'down',
      ],
    })
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
        console.log(`- ${service}`)
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
    await stopService(projectName, service, { composeFile: composeService?.[1] })
  } else if (stopAll) {
    await stopServices(projectName, filterExistingFiles(ALL_COMPOSE_FILES), { all: true })
  } else {
    await stopServices(projectName, filterExistingFiles(COMPOSE_FILES), { all: false })
  }

  showAction('Cleaning up networks...')
  if (stopAll) {
    await removeAllNetworks(projectName)
  }
  await runCommand(`docker network prune -f`)

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
