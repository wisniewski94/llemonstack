/**
 * Health check script for LLemonStack services
 *
 * Displays the health status of all running containers
 */

import { Config } from '@/core/config/config.ts'
import { dockerComposePs, type DockerComposePsResult } from '@/lib/docker.ts'

/**
 * Check the health status of all running containers
 */
export async function checkHealth(config: Config) {
  const show = config.relayer.show
  show.action(`Checking health status of ${config.projectName} containers...`)

  // docker compose -p llemonstack ps -a | awk 'NR>1 {print $1}' | xargs -I {} docker inspect --format='{{.Name}}: {{if .State.Health}}{{.State.Health.Status}}{{else}}No health check{{end}}' {}
  try {
    // Get all containers and their health status
    const containers = (await dockerComposePs(
      config.projectName,
    )) as DockerComposePsResult
    for (const container of containers) {
      show.info(
        `${container.Name}: (${container.Health || 'No health check'}) ${container.Status}`,
      )
    }
  } catch (error) {
    show.error('Error checking container health', { error })
    throw error
  }
}
