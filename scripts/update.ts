/**
 * Update to the latest sources & images
 *
 * Pulls and builds the latest changes for docker images.
 */
import { runDockerComposeCommand } from '@/lib/docker.ts'
import { Config } from '../src/core/config/config.ts'
import { stop } from './stop.ts'
import { versions } from './versions.ts'

async function pullImages(config: Config): Promise<void> {
  const show = config.relayer.show
  // Run pull for each profile in parallel
  const composeFiles = config.getComposeFiles()

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
    show.info(`Processing batch ${i + 1} of ${composeBatches.length} (${batch.length} files)`)

    // Pull images in parallel
    await Promise.all(
      batch.map((composeFile) =>
        runDockerComposeCommand(
          'pull',
          {
            projectName: config.projectName,
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
            projectName: config.projectName,
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
  config: Config,
  {
    skipStop = false,
    skipPrompt = false,
  }: { skipStop?: boolean; skipPrompt?: boolean } = {},
): Promise<void> {
  const show = config.relayer.show
  try {
    if (!skipPrompt) {
      show.info(
        '\nUpdate repos, pull the latest Docker images, and rebuild custom Docker images.\n' +
          'Only services enabled in your .env file will be updated.\n' +
          'This can take a while.',
      )
      if (!show.confirm('Are you sure you want to continue?')) {
        show.info('Update cancelled')
        return
      }
    }

    const prepareResult = await config.prepareEnv()
    if (!prepareResult.success) {
      show.logMessages(prepareResult.messages)
      Deno.exit(1)
    }

    if (!skipStop) {
      await stop(config, { all: true })
    }

    // Pull latest images
    show.action('Pulling latest docker images...')
    await pullImages(config)

    // Show the software versions for images that support it
    show.action('\n------ VERSIONS ------')
    await versions(config)

    show.action('Update successfully completed!')
  } catch (error) {
    show.error('Update failed', { error })
    Deno.exit(1)
  }
}
