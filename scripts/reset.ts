/**
 * Reset the stack to a clean state
 *
 * Deletes all docker images, volumes, and networks.
 * Deletes all repos subfolders.
 * Delete contents of the shared folder.
 * Optionally runs the update script.
 * Optionally starts the stack.
 */
import { runDockerCommand, runDockerComposeCommand } from '@/lib/docker.ts'
import { fs, path } from '@/lib/fs.ts'
import {
  confirm,
  showAction,
  showError,
  showInfo,
  showUserAction,
  showWarning,
} from '@/relayer/ui/show.ts'
import { Config } from '../src/core/config/config.ts'
import { clearConfigFile, clearEnvFile } from './init.ts'
import { update } from './update.ts'

const DOCKER_CLEANUP_COMMANDS = [
  'docker builder prune -a',
  'docker system prune -a --volumes',
]

async function dockerComposeCleanup(
  config: Config,
): Promise<void> {
  // TODO: call config.prepareRepos instead
  // Make sure repos exist before running docker compose cleanup
  // await setupRepos({ all: true })

  // Iterate through each compose file and run the down command individually
  // This catches any errors with compose files that extend a non-existent file.
  for (const [_, service] of config.getAllServices()) {
    try {
      if (!service.composeFile || !fs.existsSync(service.composeFile)) {
        showInfo(`Skip ${service} teardown, compose file not found: ${service.composeFile}`)
        continue
      }
      await runDockerComposeCommand('down', {
        projectName: config.projectName,
        composeFile: service.composeFile,
        profiles: service.getProfiles(),
        args: ['--rmi', 'all', '--volumes', '--remove-orphans'],
      })
    } catch (error) {
      showError(`Error downing ${service.service}: ${error}`)
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
  config: Config,
  { skipPrompt = false, skipCache = false }: { skipPrompt?: boolean; skipCache?: boolean } = {},
): Promise<void> {
  if (!skipPrompt) {
    showWarning(
      `WARNING: This will delete ALL data for your '${config.projectName}' stack.`,
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

  await config.prepareEnv()

  // Get the latest code for repos
  showAction('\nStopping services and cleaning up docker images...')
  await dockerComposeCleanup(config)

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
  await cleanDir(config.reposDir)

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
    await update(config, { skipStop: true, skipPrompt: true })
  } else {
    showInfo('Skipping stack update')
  }

  await clearEnvFile(config)
  await clearConfigFile(config)
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
