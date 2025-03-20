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

export async function restart(
  projectName: string,
  { service, skipOutput }: { service?: string; skipOutput?: boolean } = {},
): Promise<void> {
  try {
    await stop(projectName, { all: true, service }) // Stop all services
    await start(projectName, { service, skipOutput }) // Restart services
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  const service = Deno.args.find((arg) => !arg.startsWith('--'))
  restart(
    Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME,
    { service, skipOutput: !!service },
  )
}
