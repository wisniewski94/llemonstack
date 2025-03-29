/**
 * Update to the latest sources & images
 *
 * Pulls and builds the latest changes for docker images.
 */
import { Config } from './lib/config.ts'
import { runDockerComposeCommand } from './lib/docker.ts'
import { confirm, showAction, showError, showInfo } from './lib/logger.ts'
import { prepareEnv, setupRepos } from './start.ts'
import { stop } from './stop.ts'
import { versions } from './versions.ts'

const config = Config.getInstance()
await config.initialize()

async function pullImages(projectName: string): Promise<void> {
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
  config: Config,
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
      await stop(config, { all: true })
    }

    // Get the latest code for repos
    showAction('Update code repos...')
    await setupRepos({ config, pull: true })

    // Pull latest images
    showAction('Pulling latest docker images...')
    await pullImages(config.projectName)

    // Show the software versions for images that support it
    showAction('\n------ VERSIONS ------')
    await versions(config)

    showAction('Update successfully completed!')
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}
