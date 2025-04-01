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
  const show = config.relayer.show
  // TODO: call config.prepareRepos instead
  // Make sure repos exist before running docker compose cleanup
  // await setupRepos({ all: true })

  // Iterate through each compose file and run the down command individually
  // This catches any errors with compose files that extend a non-existent file.
  for (const [_, service] of config.getAllServices()) {
    try {
      if (!service.composeFile || !fs.existsSync(service.composeFile)) {
        show.info(`Skip ${service} teardown, compose file not found: ${service.composeFile}`)
        continue
      }
      await runDockerComposeCommand('down', {
        projectName: config.projectName,
        composeFile: service.composeFile,
        profiles: service.getProfiles(),
        args: ['--rmi', 'all', '--volumes', '--remove-orphans'],
      })
    } catch (error) {
      show.error(`Error downing ${service.service}:`, { error })
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
async function cleanDir(config: Config, dir: string): Promise<void> {
  const show = config.relayer.show
  try {
    if (!await fs.exists(dir)) {
      show.info(`Directory does not exist: ${dir}`)
      return
    }

    // Safety check: prevent deleting directories outside the current working directory
    const normalizedDir = path.normalize(dir)
    const normalizedCwd = path.normalize(Deno.cwd())
    if (!normalizedDir.startsWith(normalizedCwd)) {
      show.error(`Security error: Cannot clean directory outside of project: ${dir}`)
      show.userAction('Please delete the directory and try again.')
      Deno.exit(1)
    }

    await Deno.remove(dir, { recursive: true })
    await Deno.mkdir(dir)
  } catch (error) {
    show.error(`Error cleaning directory (${dir})`, { error })
  }
}

export async function reset(
  config: Config,
  { skipPrompt = false, skipCache = false }: { skipPrompt?: boolean; skipCache?: boolean } = {},
): Promise<void> {
  const show = config.relayer.show
  if (!skipPrompt) {
    show.warn(
      `WARNING: This will delete ALL data for your '${config.projectName}' stack.`,
    )
    show.info(
      '\nThis script deletes all docker images, volumes, and networks.\n' +
        'It resets the stack to the original clean state.\n' +
        'This can take a while.\n',
    )
    show.warn('Please backup all data before proceeding.')
    if (!show.confirm('Are you sure you want to continue?')) {
      show.info('Reset cancelled')
      return
    }
  }

  await config.prepareEnv()

  // Get the latest code for repos
  show.action('\nStopping services and cleaning up docker images...')
  await dockerComposeCleanup(config)

  if (!skipCache) {
    if (skipPrompt || show.confirm('Do you want to clean the docker cache?', false)) {
      for (const cmd in DOCKER_CLEANUP_COMMANDS) {
        await runCleanupCommand(DOCKER_CLEANUP_COMMANDS[cmd])
      }
    } else {
      show.info('Skipping docker cache cleanup')
    }
  } else {
    show.action('\nSkipping docker cache cleanup, --skip-cache was used')
    show.info('To manually clean the docker cache, run:')
    for (const cmd in DOCKER_CLEANUP_COMMANDS) {
      show.info(`> ${cmd}`)
    }
  }

  show.action('\nCleaning up repos directory...')
  await cleanDir(config, config.reposDir)

  show.action('\nCleaning up shared folder...')
  if (!skipPrompt) {
    show.info(
      'The shared folder is used to share files between the docker services and the host machine.\n' +
        'It is not needed for the stack to run and can be deleted.',
    )
    show.warn(
      'Please verify the contents of the shared folder before deleting it.',
    )
    show.info(`Shared folder: ${config.sharedDir}`)
  }
  if (
    skipPrompt || show.confirm('Do you want to delete the shared folder?', true)
  ) {
    await cleanDir(config, config.sharedDir)
    show.info('Shared folder reset')
  } else {
    show.info('Skipping shared folder cleanup')
  }

  // Don't update the stack by default
  if (!skipPrompt && show.confirm('Do you want to update the stack to latest versions?', false)) {
    show.action('\nUpdating the stack...')
    show.info(
      'Updating the stack will only update services enabled in your .env file.',
    )
    await update(config, { skipStop: true, skipPrompt: true })
  } else {
    show.info('Skipping stack update')
  }

  await clearEnvFile(config)
  await clearConfigFile(config)
  show.info('Environment and config files reset')

  const volumesDir = config.volumesDir
  show.action('\nResetting volumes...')
  show.info(
    '\nThe volumes dir contains data from the docker containers.\n' +
      'It should be deleted to completely reset the stack.\n' +
      'Please verify the contents of the volumes dir before deleting it.\n\n' +
      `Volumes dir: ${volumesDir}`,
  )

  if (show.confirm('Delete the volumes dir?')) {
    await Deno.remove(volumesDir, { recursive: true })
    show.info('Volumes dir deleted')
  } else {
    show.info('Skipping volumes dir deletion')
  }

  show.action('\nReset successfully completed!')

  show.userAction('Run `llmn init` to reinitialize the stack')
}
