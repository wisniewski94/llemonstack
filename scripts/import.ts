#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Import workflows and credentials from the import folder
 *
 * Usage:
 *
 * ```bash
 * deno run import:n8n
 *
 * # Skip the prompt to confirm the import
 * deno run import:n8n -f
 *
 * # Skip archiving after importing
 * deno run import:n8n --skip-archive
 * ```
 */

import * as fs from 'jsr:@std/fs'
import * as path from 'jsr:@std/path'
import { runContainerCommand } from './lib/containers.ts'
import {
  confirm,
  DEFAULT_PROJECT_NAME,
  IMPORT_DIR_BASE,
  loadEnv,
  prepareEnv,
  showError,
  showInfo,
  showWarning,
} from './start.ts'

async function resetN8nImportFolder(importDir: string): Promise<void> {
  showInfo(`Clearing import folder: ${importDir}`)
  const credentialsDir = path.join(importDir, 'credentials')
  const workflowsDir = path.join(importDir, 'workflows')

  // Delete directories if they exist
  if (await fs.exists(credentialsDir)) {
    await Deno.remove(credentialsDir, { recursive: true })
  }
  if (await fs.exists(workflowsDir)) {
    await Deno.remove(workflowsDir, { recursive: true })
  }

  // Recreate directories
  await fs.ensureDir(credentialsDir)
  await fs.ensureDir(workflowsDir)

  // Create .keep files in each directory
  await Deno.writeTextFile(path.join(credentialsDir, '.keep'), '')
  await Deno.writeTextFile(path.join(workflowsDir, '.keep'), '')
}

async function archiveN8nImportFolder(): Promise<void> {
  const n8nImportDir = path.join(IMPORT_DIR_BASE, 'n8n')
  const archiveBaseDir = path.join(IMPORT_DIR_BASE, `.imported`)

  // Create timestamp for unique archive folder
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const newArchiveDir = path.join(archiveBaseDir, `n8n-${timestamp}`)

  showInfo(`Archiving import folder: ${n8nImportDir} -> ${newArchiveDir}`)

  // Create archive directory if it doesn't exist
  await fs.ensureDir(newArchiveDir)

  // Check if import folder exists
  if (!await fs.exists(n8nImportDir)) {
    showWarning(`Import folder not found: ${n8nImportDir}`)
    return
  }
  // Copy the directory recursively
  await fs.copy(n8nImportDir, newArchiveDir, { overwrite: true })

  resetN8nImportFolder(n8nImportDir)
}

/**
 * Replace all ${var} template in credentials import folder with env vars
 *
 * This ensures the credentials are correct for the current stack configuration.
 */
async function prepareCredentialsImport(): Promise<void> {
  const credentialsDir = path.join(IMPORT_DIR_BASE, 'n8n', 'credentials')
  const credentials = Deno.readDir(credentialsDir)

  // Load env vars from .env file
  const envVars = await loadEnv({ silent: true })

  for await (const credential of credentials) {
    const credentialPath = path.join(credentialsDir, credential.name)
    const credentialContent = await Deno.readTextFile(credentialPath)
    let updated = false
    const updatedContent = credentialContent.replace(/\$\{([^}]+)\}/g, (match, p1) => {
      const envVar = envVars[p1]
      if (envVar) {
        updated = true
        showInfo(`Updating ${credentialPath} with env var: $\{${p1}\}`)
      } else {
        showWarning(`No env var found for $\{${p1}\} in ${credentialPath}`)
      }
      return envVar || match
    })
    if (updated) {
      await Deno.writeTextFile(credentialPath, updatedContent)
    }
  }
}

async function importToN8n(
  projectName: string,
  { skipPrompt = false, archiveAfterImport = true }: {
    skipPrompt?: boolean
    archiveAfterImport?: boolean
  } = {},
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
    // Replace all ${var} template in credentials import folder with env vars
    await prepareCredentialsImport()

    // Import credentials from import/n8n/credentials
    await runContainerCommand(projectName, 'n8n', 'n8n', {
      args: [
        'import:credentials',
        '--separate',
        '--input=/import/credentials',
      ],
    })

    // Import workflows from import/n8n/workflows
    await runContainerCommand(projectName, 'n8n', 'n8n', {
      args: [
        'import:workflow',
        '--separate',
        '--input=/import/workflows',
      ],
    })

    // TODO: archive BEFORE the import to capture the state before
    // env vars are replaced. Then delete the converted files after import.

    if (archiveAfterImport) {
      // Archive the import folder
      // This will clear the import folder and archive it to import/.imported
      // This prevents accidental overwriting of workflows and credentials
      // when import is run multiple times.
      await archiveN8nImportFolder()
    }
  } catch (error) {
    showError('Error during import', error)
    Deno.exit(1)
  }
}

export async function runImport(
  projectName: string,
  { skipPrompt = false, archiveAfterImport = true }: {
    skipPrompt?: boolean
    archiveAfterImport?: boolean
  } = {},
): Promise<void> {
  // Check if -f force flag is present
  skipPrompt = skipPrompt || Deno.args.includes('-f')
  // Check if --skip-archive flag is present
  archiveAfterImport = archiveAfterImport || Deno.args.includes('--skip-archive')

  await prepareEnv({ silent: false })
  await importToN8n(projectName, { skipPrompt, archiveAfterImport })
}

// Run script if this file is executed directly
if (import.meta.main) {
  runImport(Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME)
}
