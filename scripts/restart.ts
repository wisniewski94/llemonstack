/**
 * Stop and restart the services
 */
import { Config } from '../src/core/config/config.ts'
import { start } from './start.ts' // Adjust the path as necessary
import { stop } from './stop.ts' // Adjust the path as necessary

export async function restart(
  config: Config,
  { service, skipOutput }: { service?: string; skipOutput?: boolean } = {},
): Promise<void> {
  const show = config.relayer.show
  try {
    await stop(config, { all: true, service }) // Stop all services
    await start(config, { service, skipOutput }) // Restart services
  } catch (error) {
    show.error('Failed to restart services', { error })
    Deno.exit(1)
  }
}
