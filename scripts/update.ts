#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Update to the latest sources & images
 *
 * Pulls and builds the latest changes for docker images.
 */
import { runDockerComposeCommand } from './lib/docker.ts'
import {
  COMPOSE_FILES,
  confirm,
  DEFAULT_PROJECT_NAME,
  prepareEnv,
  setupRepos,
  showAction,
  showError,
  showInfo,
} from './start.ts'
import { stop } from './stop.ts'
import { versions } from './versions.ts'

async function pullImages(projectName: string): Promise<void> {
  // Run pull for each profile in parallel
  const composeFiles = COMPOSE_FILES

  // Split compose files into batches of 5 to avoid overwhelming the system
  const batchSize = 4
  const composeBatches = []

  // Create batches from the compose files
  for (let i = 0; i < composeFiles.length; i += batchSize) {
    composeBatches.push(composeFiles.slice(i, i + batchSize))
  }

  // Process each batch sequentially
  for (let i = 0; i < composeBatches.length; i++) {
    const batch = composeBatches[i]
    showInfo(`Processing batch ${i + 1} of ${composeBatches.length} (${batch.length} files)`)

    // Pull images in parallel
    await Promise.all(
      batch.map((composeFile) =>
        runDockerComposeCommand(
          'pull',
          {
            projectName,
            composeFile,
            ansi: 'never',
            // TODO: add support for service specific profiles
            // ...getProfilesArgs(), // Only pull images for enabled profiles
          },
        )
      ),
    )
    // Build images in parallel
    await Promise.all(
      batch.map((composeFile) =>
        runDockerComposeCommand(
          'build',
          {
            projectName,
            composeFile,
            ansi: 'never',
            // TODO: add support for service specific profiles
            // ...getProfilesArgs(), // Only pull images for enabled profiles
            args: ['--no-cache'],
          },
        )
      ),
    )
  }
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
