/**
 * Import workflows and credentials from the import folder
 */

import { RunCommandOutput } from '@/lib/command.ts'
import { dockerExec } from '@/lib/docker.ts'
import { fs, path } from '@/lib/fs.ts'
import { Config } from '../src/core/config/config.ts'

async function resetN8nImportFolder(config: Config, importDir: string): Promise<void> {
  const show = config.relayer.show
  show.info(`Clearing import folder: ${importDir}`)
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

async function archiveN8nImportFolder(config: Config): Promise<void> {
  const show = config.relayer.show
  const n8nImportDir = path.join(config.importDir, 'n8n')
  const archiveBaseDir = path.join(config.importDir, `.imported`)

  // Create timestamp for unique archive folder
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const newArchiveDir = path.join(archiveBaseDir, `n8n-${timestamp}`)

  show.info(`Archiving import folder: ${n8nImportDir} -> ${newArchiveDir}`)

  // Create archive directory if it doesn't exist
  await fs.ensureDir(newArchiveDir)

  // Check if import folder exists
  if (!await fs.exists(n8nImportDir)) {
    show.warn(`Import folder not found: ${n8nImportDir}`)
    return
  }
  // Copy the directory recursively
  await fs.copy(n8nImportDir, newArchiveDir, { overwrite: true })

  resetN8nImportFolder(config, n8nImportDir)
}

/**
 * Replace all ${var} template in credentials import folder with env vars
 *
 * This ensures the credentials are correct for the current stack configuration.
 */
async function prepareCredentialsImport(config: Config): Promise<void> {
  const show = config.relayer.show
  const credentialsDir = path.join(config.importDir, 'n8n', 'credentials')
  const credentials = Deno.readDir(credentialsDir)

  // Load env vars from .env file
  const envVars = config.env

  for await (const credential of credentials) {
    const credentialPath = path.join(credentialsDir, credential.name)
    const credentialContent = await Deno.readTextFile(credentialPath)
    let updated = false
    const updatedContent = credentialContent.replace(/\$\{([^}]+)\}/g, (match, p1) => {
      const envVar = envVars[p1]
      if (envVar) {
        updated = true
        show.info(`Updating ${credentialPath} with env var: $\{${p1}\}`)
      } else {
        show.warn(`No env var found for $\{${p1}\} in ${credentialPath}`)
      }
      return envVar || match
    })
    if (updated) {
      await Deno.writeTextFile(credentialPath, updatedContent)
    }
  }
}

async function importToN8n(
  config: Config,
  { skipPrompt = false, archiveAfterImport = true }: {
    skipPrompt?: boolean
    archiveAfterImport?: boolean
  } = {},
): Promise<void> {
  const show = config.relayer.show
  if (!skipPrompt) {
    show.warn(
      'WARNING: Importing n8n data overwrites existing workflows and credentials',
    )
    show.info(
      "If you've previously imported any of the workflows or credentials\n" +
        "in the import folder, any modifications you've made will be overwritten.\n" +
        'Only the credentials and workflows matching those in the import folder will be overwritten.',
    )
    if (!show.confirm('Are you sure you want to continue?')) {
      show.info('Import cancelled')
      return
    }
  }

  try {
    // Replace all ${var} template in credentials import folder with env vars
    await prepareCredentialsImport(config)

    const getNumImported = (results: RunCommandOutput) => {
      const matches = results.stdout.match(/Importing (\d+) /)
      return matches ? parseInt(matches[1]) : 0
    }

    let results: RunCommandOutput

    // Import credentials from import/n8n/credentials
    results = await dockerExec(config.projectName, 'n8n', 'n8n', {
      args: [
        'import:credentials',
        '--separate',
        '--input=/import/credentials',
      ],
      silent: true,
      captureOutput: true,
    })
    if (!results.success) {
      show.error('Error importing credentials', { error: results.stderr })
    } else {
      show.action(`Imported ${getNumImported(results)} credentials`)
      show.info(results.stdout)
    }

    // Import workflows from import/n8n/workflows
    results = await dockerExec(config.projectName, 'n8n', 'n8n', {
      args: [
        'import:workflow',
        '--separate',
        '--input=/import/workflows',
      ],
      silent: true,
      captureOutput: true,
    })
    if (!results.success) {
      show.error('Error importing workflows', { error: results.stderr })
    } else {
      show.action(`Imported ${getNumImported(results)} workflows`)
      show.info(results.stdout)
    }

    // TODO: archive BEFORE the import to capture the state before
    // env vars are replaced. Then delete the converted files after import.

    if (archiveAfterImport) {
      // Archive the import folder
      // This will clear the import folder and archive it to import/.imported
      // This prevents accidental overwriting of workflows and credentials
      // when import is run multiple times.
      await archiveN8nImportFolder(config)
    }
  } catch (error) {
    show.error('Error during import', { error })
    Deno.exit(1)
  }
}

export async function runImport(
  config: Config,
  { skipPrompt = false, archive = true }: {
    skipPrompt?: boolean
    archive?: boolean
  } = {},
): Promise<void> {
  const prepareEnvResult = await config.prepareEnv()
  if (!prepareEnvResult.success) {
    config.relayer.show.logMessages(prepareEnvResult.messages)
    Deno.exit(1)
  }
  await importToN8n(config, { skipPrompt, archiveAfterImport: archive })
}
