/**
 * Update to the latest sources & images
 *
 * Pulls and builds the latest changes for docker images.
 */
import { Config } from '../src/core/config/config.ts'
import { stop } from './stop.ts'
import { versions } from './versions.ts'

async function pullImages(config: Config): Promise<void> {
  const show = config.relayer.show

  const services = config.getEnabledServices().toArray()

  const batchSize = 4
  const composeBatches = []

  // Create batches to not overwhelm the system
  for (let i = 0; i < services.length; i += batchSize) {
    composeBatches.push(services.slice(i, i + batchSize))
  }

  for (let i = 0; i < composeBatches.length; i++) {
    const batch = composeBatches[i]
    show.info(`Processing batch ${i + 1} of ${composeBatches.length} (${batch.length} files)`)

    // Update services in parallel
    await Promise.all(
      batch.map((service) => service.update({ silent: false })),
    )
  }
}

export async function update(
  config: Config,
  {
    skipStop = false,
    skipPrompt = false,
    service: serviceName,
  }: { skipStop?: boolean; skipPrompt?: boolean; service?: string } = {},
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

    if (!skipStop) {
      await stop(config, { all: true })
    } else {
      const prepareResult = await config.prepareEnv()
      if (!prepareResult.success) {
        show.logMessages(prepareResult.messages)
        Deno.exit(1)
      }
    }

    if (serviceName) {
      const service = config.getServiceByName(serviceName)
      if (!service) {
        show.error(`Service ${serviceName} not found`)
        Deno.exit(1)
      }
      show.action(`\nPulling latest docker image for ${service.name}...`)
      await service.update()
    } else {
      // Pull latest images
      show.action('Pulling latest docker images...')
      await pullImages(config)
    }

    // Show the software versions for images that support it
    show.action('\n------ VERSIONS ------')
    await versions(config)

    show.action('Update successfully completed!')
  } catch (error) {
    show.error('Update failed', { error })
    Deno.exit(1)
  }
}
