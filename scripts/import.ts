#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Import workflows and credentials from the import folder
 *
 * Usage:
 *
 * ```bash
 * deno run import
 *
 * # Skip the prompt to confirm the import
 * deno run import -f
 *
 * # Skip starting the services before importing
 * deno run import --skip-start
 * deno run import -s
 * ```
 */

import {
  confirm,
  DEFAULT_PROJECT_NAME,
  prepareEnv,
  showError,
  showInfo,
  showWarning,
  start,
  startService,
} from './start.ts'

async function importToN8n(
  projectName: string,
  { skipPrompt = false, skipStart = false }: { skipPrompt?: boolean; skipStart?: boolean } = {},
): Promise<void> {
  if (!skipPrompt) {
    showWarning(
      'WARNING: Importing will overwrite existing workflows and credentials',
    )
    showInfo(
      "\nIf you've previously imported any of the workflows or credentials\n" +
        "in the import folder, any modifications you've made will be overwritten.\n" +
        'Only the credentials and workflows matching those in the import folder will be overwritten.',
    )
    if (!confirm('Are you sure you want to continue?')) {
      showInfo('Import cancelled')
      return
    }
  }

  try {
    // Only start services if --skip-start is not present
    if (!skipStart) {
      await start(projectName)
    } else {
      showInfo('Skipping start up of services')
    }
    await startService(projectName, 'n8n', {
      profiles: ['n8n-import'],
    })
  } catch (error) {
    showError('Error during import', error)
    Deno.exit(1)
  }
}

export async function runImport(
  projectName: string,
  { skipPrompt = false, skipStart = false }: { skipPrompt?: boolean; skipStart?: boolean } = {},
): Promise<void> {
  // Check if -f force flag is present
  skipPrompt = skipPrompt || Deno.args.includes('-f')
  // Check if --skip-start flag is present
  skipStart = skipStart || Deno.args.includes('--skip-start') || Deno.args.includes('-s')

  await prepareEnv({ silent: false })
  await importToN8n(projectName, { skipPrompt, skipStart })
}

// Run script if this file is executed directly
if (import.meta.main) {
  runImport(Deno.env.get('DOCKER_PROJECT_NAME') || DEFAULT_PROJECT_NAME)
}
