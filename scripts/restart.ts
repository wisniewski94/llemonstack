#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Stop and restart the services
 *
 * Usage:
 *
 * ```bash
 * deno run restart
 * ```
 */
import { DEFAULT_PROJECT_NAME, showError, start } from './start.ts' // Adjust the path as necessary
import { stop } from './stop.ts' // Adjust the path as necessary

export async function restart(projectName: string): Promise<void> {
  // TODO: add support for restarting a single service
  try {
    await stop(projectName, { all: true }) // Stop all services
    await start(projectName) // Restart services
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  restart(Deno.env.get('DOCKER_PROJECT_NAME') || DEFAULT_PROJECT_NAME)
}
