#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Reset the stack to a clean state
 *
 * Deletes all docker images, volumes, and networks.
 * Deletes all repos subfolders.
 * Delete contents of the shared folder.
 * Optionally runs the update script.
 * Optionally starts the stack.
 *
 * Usage:
 *
 * ```bash
 * deno run reset
 *
 * # Skip the prompt
 * deno run reset reset -f
 *
 * # Skip cleaning docker cache
 * deno run reset --skip-cache
 * ```
 */
import * as fs from 'jsr:@std/fs'
import { clearConfigFile, clearEnvFile } from './init.ts'
import {
  ALL_COMPOSE_FILES,
  confirm,
  DEFAULT_PROJECT_NAME,
  filterExistingFiles,
  getProfilesArgs,
  getVolumesPath,
  prepareEnv,
  REPO_DIR,
  REPO_DIR_BASE,
  runCommand,
  setupRepos,
  SHARED_DIR,
  showAction,
  showError,
  showInfo,
  showUserAction,
  showWarning,
} from './start.ts'
import { update } from './update.ts'

const COMMANDS = {
  cleanBuildCache: 'docker builder prune -a',
  cleanSystemCache: 'docker system prune -a --volumes',
}

async function dockerComposeCleanup(
  projectName: string,
  composeFiles: string[],
): Promise<void> {
  // Make sure repos exist before running docker compose cleanup
  await setupRepos({ all: true })
  // Iterate through each compose file and run the down command individually
  // This catches any errors with compose files that extend a non-existent file.
  for (const composeFile of composeFiles) {
    try {
      await runCommand('docker', {
        args: [
          'compose',
          '-p',
          projectName,
          '-f',
          composeFile,
          ...getProfilesArgs({ all: true }),
          'down',
          '--rmi',
          'all',
          '--volumes',
          '--remove-orphans',
        ],
      })
    } catch (error) {
      showError(`Error downing ${composeFile}: ${error}`)
    }
  }
}

async function dockerBuilderCleanUp(): Promise<void> {
  await runCommand(COMMANDS.cleanBuildCache)
}

async function dockerSystemCleanUp(): Promise<void> {
  await runCommand(COMMANDS.cleanSystemCache)
}

async function cleanDir(dir: string): Promise<void> {
  try {
    if (await fs.exists(dir)) {
      await Deno.remove(dir, { recursive: true })
    }
    await Deno.mkdir(dir)
  } catch (error) {
    showError(`Error cleaning directory (${dir})`, error)
  }
}

async function cleanSharedDir(): Promise<void> {
  const dir = SHARED_DIR
  if (dir.includes('shared')) { // Sanity check
    await cleanDir(dir)
  }
}

async function cleanReposDir(): Promise<void> {
  const dir = REPO_DIR
  if (dir.includes(REPO_DIR_BASE)) { // Sanity check
    await cleanDir(dir)
  }
}

export async function reset(
  projectName: string,
  { skipPrompt = false, skipCache = false }: { skipPrompt?: boolean; skipCache?: boolean } = {},
): Promise<void> {
  try {
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

    // Get the latest compose files, skipping any that don't exist
    const composeFiles = filterExistingFiles(ALL_COMPOSE_FILES)

    // Get the latest code for repos
    if (composeFiles.length > 0) {
      showAction('\nStopping services and cleaning up docker images...')
      await dockerComposeCleanup(projectName, composeFiles)
    } else {
      showInfo(
        'No existing compose files found, skipping docker compose cleanup',
      )
    }

    if (!skipCache) {
      if (confirm('Do you want to clean the docker cache?', false)) {
        await dockerBuilderCleanUp()
        await dockerSystemCleanUp()
      } else {
        showInfo('Skipping docker cache cleanup')
      }
    } else {
      showAction('\nSkipping docker cache cleanup, --skip-cache was used')
      showInfo('To manually clean the docker cache, run:')
      showInfo(`> ${COMMANDS.cleanBuildCache}`)
      showInfo(`> ${COMMANDS.cleanSystemCache}`)
    }

    showAction('\nCleaning up repos directory...')
    await cleanReposDir()

    showAction('\nCleaning up shared folder...')
    if (!skipPrompt) {
      showInfo(
        'The shared folder is used to share files between the docker services and the host machine.\n' +
          'It is not needed for the stack to run and can be deleted.',
      )
      showWarning(
        'Please verify the contents of the shared folder before deleting it.',
      )
      showInfo(`Shared folder: ${SHARED_DIR}`)
    }
    if (
      skipPrompt || confirm('Do you want to delete the shared folder?', true)
    ) {
      await cleanSharedDir()
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

    const volumesDir = getVolumesPath()
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

    showUserAction('Run `deno run init` to reinitialize the stack')
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  reset(Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME, {
    skipPrompt: Deno.args.includes('-f'),
    skipCache: Deno.args.includes('--skip-cache'),
  })
}
