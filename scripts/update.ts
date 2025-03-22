#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Update to the latest sources & images
 *
 * Pulls the latest changes for docker images.
 *
 * Usage:
 *
 * ```bash
 * deno run update
 *
 * # Skip stopping the services
 * deno run update --skip-stop
 * deno run update -s
 *
 * # Skip the prompt
 * deno run update -f
 * ```
 */
import {
  COMPOSE_FILES,
  confirm,
  DEFAULT_PROJECT_NAME,
  getProfilesArgs,
  prepareEnv,
  runCommand,
  setupRepos,
  showAction,
  showError,
  showInfo,
} from './start.ts'
import { stop } from './stop.ts'
import { versions } from './versions.ts'

async function pullImages(projectName: string): Promise<void> {
  await runCommand('docker', {
    args: [
      'compose',
      '-p',
      projectName,
      ...COMPOSE_FILES.map((file) => ['-f', file]).flat(),
      // TODO: get profiles for each service config, currently ollama will not be updated?
      ...getProfilesArgs(), // Only pull images for enabled profiles
      'pull',
    ],
  })
}

export async function update(
  projectName: string,
  {
    skipStop = false,
    skipPrompt = false,
  }: { skipStop?: boolean; skipPrompt?: boolean } = {},
): Promise<void> {
  try {
    if (!skipPrompt) {
      showInfo(
        '\nUpdate repos, pull the latest Docker images, and rebuild custom Docker images.\n' +
          'Only services enabled in your .env file will be updated.\n' +
          'This can take a while.',
      )
      if (!confirm('Are you sure you want to continue?')) {
        showInfo('Update cancelled')
        return
      }
    }

    await prepareEnv({ silent: false })

    if (!skipStop) {
      await stop(projectName, { all: true })
    }

    // Get the latest code for repos
    showAction('Update code repos...')
    await setupRepos({ pull: true })

    // Pull latest images
    showAction('Pulling latest docker images...')
    await pullImages(projectName)

    // Show the software versions for images that support it
    showAction('\n------ VERSIONS ------')
    await versions(projectName)

    showAction('Update successfully completed!')
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  update(Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME, {
    skipPrompt: Deno.args.includes('-f'),
    skipStop: Deno.args.includes('--skip-stop') || Deno.args.includes('-s'),
  })
}
