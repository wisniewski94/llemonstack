#!/usr/bin/env -S deno run --allow-env --allow-run --allow-read

/**
 * Health check script for LLemonStack services
 *
 * Displays the health status of all running containers
 */

import { DEFAULT_PROJECT_NAME, runCommand } from './start.ts'

/**
 * Check the health status of all running containers
 */
export async function checkHealth(projectName: string) {
  console.log(`Checking health status of ${projectName} containers...`)

  // docker compose -p llemonstack ps -a | awk 'NR>1 {print $1}' | xargs -I {} docker inspect --format='{{.Name}}: {{if .State.Health}}{{.State.Health.Status}}{{else}}No health check{{end}}' {}
  try {
    // Get all containers and their health status
    const containers = (await runCommand(
      'docker',
      {
        args: [
          'compose',
          '-p',
          projectName,
          'ps',
          '-a',
          '--format',
          'json',
        ],
        captureOutput: true,
        silent: true,
      },
    )).toJsonList()

    for (const container of containers) {
      console.log(
        `${container.Name}: (${container.Health || 'No health check'}) ${container.Status}`,
      )
    }
  } catch (error) {
    console.error(`Error checking container health: ${error}`)
    throw error
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  await checkHealth(Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME)
}
