#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Reset the stack to a clean state
 *
 * Deletes all docker images, volumes, and networks.
 * Deletes all repos subfolders.
 * Delete contents of the shared folder.
 * Optionally runs the update script.
 * Optionally starts the stack.
 */
import { clearConfigFile, clearEnvFile } from './init.ts'
import { Config } from './lib/config/config.ts'
import { runDockerCommand, runDockerComposeCommand } from './lib/docker.ts'
import { fs, path } from './lib/fs.ts'
import {
  confirm,
  showAction,
  showError,
  showInfo,
  showUserAction,
  showWarning,
} from './lib/logger.ts'
import {
  ALL_COMPOSE_SERVICES,
  DEFAULT_PROJECT_NAME,
  getProfilesArgs,
  prepareEnv,
  setupRepos,
} from './start.ts'
import { update } from './update.ts'

const config = Config.getInstance()
await config.initialize()

const DOCKER_CLEANUP_COMMANDS = [
  'docker builder prune -a',
  'docker system prune -a --volumes',
]

async function dockerComposeCleanup(
  projectName: string,
): Promise<void> {
  const composeFiles = await ALL_COMPOSE_SERVICES
  // Make sure repos exist before running docker compose cleanup
  await setupRepos({ all: true })
  // Iterate through each compose file and run the down command individually
  // This catches any errors with compose files that extend a non-existent file.
  for (const [service, composeFile] of composeFiles) {
    try {
      if (!composeFile || !fs.existsSync(composeFile)) {
        showInfo(`Skip ${service} teardown, compose file not found: ${composeFile}`)
        continue
      }
      await runDockerComposeCommand('down', {
        projectName,
        composeFile,
        profiles: getProfilesArgs({ all: true }),
        args: ['--rmi', 'all', '--volumes', '--remove-orphans'],
      })
    } catch (error) {
      showError(`Error downing ${composeFile}: ${error}`)
    }
  }
}

async function runCleanupCommand(command: string): Promise<void> {
  const args = command.split(' ').slice(1) // Get array and remove 'docker'
  await runDockerCommand(args[0], { args: args.slice(1) })
}

/**
 * Clean a directory by deleting it and recreating it
 * @param dir - The directory to clean
 */
async function cleanDir(dir: string): Promise<void> {
  try {
    if (!await fs.exists(dir)) {
      showInfo(`Directory does not exist: ${dir}`)
      return
    }

    // Safety check: prevent deleting directories outside the current working directory
    const normalizedDir = path.normalize(dir)
    const normalizedCwd = path.normalize(Deno.cwd())
    if (!normalizedDir.startsWith(normalizedCwd)) {
      showError(`Security error: Cannot clean directory outside of project: ${dir}`)
      showUserAction('Please delete the directory and try again.')
      Deno.exit(1)
    }

    await Deno.remove(dir, { recursive: true })
    await Deno.mkdir(dir)
  } catch (error) {
    showError(`Error cleaning directory (${dir})`, error)
  }
}

export async function reset(
  projectName: string,
  { skipPrompt = false, skipCache = false }: { skipPrompt?: boolean; skipCache?: boolean } = {},
): Promise<void> {
  if (!skipPrompt) {
    showWarning(
      `WARNING: This will delete ALL data for your '${projectName}' stack.`,
    )
    showInfo(
      '\nThis script deletes all docker images, volumes, and networks.\n' +
        'It resets the stack to the original clean state.\n' +
        'This can take a while.\n',
    )
    showWarning('Please backup all data before proceeding.')
    if (!confirm('Are you sure you want to continue?')) {
      showInfo('Reset cancelled')
      return
    }
  }

  await prepareEnv({ silent: false })

  // Get the latest code for repos
  showAction('\nStopping services and cleaning up docker images...')
  await dockerComposeCleanup(projectName)

  if (!skipCache) {
    if (skipPrompt || confirm('Do you want to clean the docker cache?', false)) {
      for (const cmd in DOCKER_CLEANUP_COMMANDS) {
        await runCleanupCommand(DOCKER_CLEANUP_COMMANDS[cmd])
      }
    } else {
      showInfo('Skipping docker cache cleanup')
    }
  } else {
    showAction('\nSkipping docker cache cleanup, --skip-cache was used')
    showInfo('To manually clean the docker cache, run:')
    for (const cmd in DOCKER_CLEANUP_COMMANDS) {
      showInfo(`> ${cmd}`)
    }
  }

  showAction('\nCleaning up repos directory...')
  await cleanDir(config.repoDir)

  showAction('\nCleaning up shared folder...')
  if (!skipPrompt) {
    showInfo(
      'The shared folder is used to share files between the docker services and the host machine.\n' +
        'It is not needed for the stack to run and can be deleted.',
    )
    showWarning(
      'Please verify the contents of the shared folder before deleting it.',
    )
    showInfo(`Shared folder: ${config.sharedDir}`)
  }
  if (
    skipPrompt || confirm('Do you want to delete the shared folder?', true)
  ) {
    await cleanDir(config.sharedDir)
    showInfo('Shared folder reset')
  } else {
    showInfo('Skipping shared folder cleanup')
  }

  // Don't update the stack by default
  if (!skipPrompt && confirm('Do you want to update the stack to latest versions?', false)) {
    showAction('\nUpdating the stack...')
    showInfo(
      'Updating the stack will only update services enabled in your .env file.',
    )
    await update(projectName, { skipStop: true, skipPrompt: true })
  } else {
    showInfo('Skipping stack update')
  }

  await clearEnvFile()
  await clearConfigFile()
  showInfo('Environment and config files reset')

  const volumesDir = config.volumesDir
  showAction('\nResetting volumes...')
  showInfo(
    '\nThe volumes dir contains data from the docker containers.\n' +
      'It should be deleted to completely reset the stack.\n' +
      'Please verify the contents of the volumes dir before deleting it.\n\n' +
      `Volumes dir: ${volumesDir}`,
  )

  if (confirm('Delete the volumes dir?')) {
    await Deno.remove(volumesDir, { recursive: true })
    showInfo('Volumes dir deleted')
  } else {
    showInfo('Skipping volumes dir deletion')
  }

  showAction('\nReset successfully completed!')

  showUserAction('Run `llmn init` to reinitialize the stack')
}

// Run script if this file is executed directly
if (import.meta.main) {
  reset(Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME, {
    skipPrompt: Deno.args.includes('-f'),
    skipCache: Deno.args.includes('--skip-cache'),
  })
}
