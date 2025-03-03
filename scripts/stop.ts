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
  COMPOSE_FILES,
  DEFAULT_PROJECT_NAME,
  filterExistingFiles,
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

async function down(
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

export async function stop(
  projectName: string,
  { all = false }: { all?: boolean } = {},
): Promise<void> {
  const stopAll = all || Deno.args.includes('--all')

  await prepareEnv({ silent: false })

  if (stopAll) {
    showAction('Stopping all services...')
  } else {
    showAction('Stopping enabled services...')
  }
  // If stopAll, make sure repos are all available
  if (stopAll) {
    try {
      await setupRepos({ all: true })
    } catch (error) {
      showError('Unable to setup repos, docker compose down may fail', error)
    }
  }

  try {
    const files = stopAll ? ALL_COMPOSE_FILES : COMPOSE_FILES
    const composeFiles = filterExistingFiles(files)
    await down(projectName, composeFiles, { all: stopAll })

    showAction('Cleaning up networks...')
    if (stopAll) {
      await removeAllNetworks(projectName)
    }
    await runCommand(`docker network prune -f`)

    showAction('All services stopped')
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  stop(Deno.env.get('DOCKER_PROJECT_NAME') || DEFAULT_PROJECT_NAME)
}
