/**
 * Import workflows and credentials from the import folder
 */

import { Config } from '@/core/config/config.ts'
import { getFlowiseApiKey } from '@/lib/flowise.ts'
import { fs, path } from '@/lib/fs.ts'

// todo: remove this
const config = Config.getInstance()
await config.initialize()

const FLOWISE_BASE_URL = 'http://localhost:3001'
const FLOWISE_IMPORT_DIR = path.join(config.importDir, 'flowise')
const ARCHIVE_BASE_DIR = path.join(config.importDir, `.imported`)

async function resetFlowiseImportFolder(importDir: string): Promise<void> {
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

async function archiveFlowiseImportFolder(): Promise<void> {
  const show = config.relayer.show
  // Create timestamp for unique archive folder
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const newArchiveDir = path.join(ARCHIVE_BASE_DIR, `flowise-${timestamp}`)

  show.info(`Archiving import folder: ${FLOWISE_IMPORT_DIR} -> ${newArchiveDir}`)

  // Create archive directory if it doesn't exist
  await fs.ensureDir(newArchiveDir)

  // Check if import folder exists
  if (!await fs.exists(FLOWISE_IMPORT_DIR)) {
    show.warn(`Import folder not found: ${FLOWISE_IMPORT_DIR}`)
    return
  }
  // Copy the directory recursively
  await fs.copy(FLOWISE_IMPORT_DIR, newArchiveDir, { overwrite: true })

  resetFlowiseImportFolder(FLOWISE_IMPORT_DIR)
}

async function importFolder(
  type: 'MULTIAGENT' | 'CHATFLOW',
  { apiKey }: { apiKey: string },
) {
  const show = config.relayer.show
  const subdir = type === 'MULTIAGENT' ? 'agentflows' : 'chatflows'

  // Import Flowise workflows from JSON files
  const flowiseImportDir = path.join(config.importDir, 'flowise', subdir)

  // Ensure the import directory exists
  await fs.ensureDir(flowiseImportDir)

  // Check if there are any JSON files to import
  const entries = Deno.readDir(flowiseImportDir)
  let filesFound = false

  show.info(`Importing Flowise ${type} workflows from ${flowiseImportDir}...`)

  for await (const entry of entries) {
    if (entry.isFile && entry.name.endsWith('.json')) {
      filesFound = true
      const filePath = path.join(flowiseImportDir, entry.name)
      show.info(`Importing workflow from ${entry.name}...`)

      try {
        // Read the JSON file
        const fileContent = await Deno.readTextFile(filePath)

        // Make API request to create the workflow
        const requestBody = {
          name: entry.name,
          flowData: fileContent, // flowData is a stringified JSON object
          type,
        }
        const response = await fetch(`${FLOWISE_BASE_URL}/api/v1/chatflows`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          const errorText = await response.text()
          show.error(
            `Failed to import ${entry.name}: ${response.status} ${response.statusText}`,
            { error: errorText },
          )
        } else {
          const result = await response.json()
          show.info(`Successfully imported workflow: ${result.name || entry.name}`)
        }
      } catch (error) {
        show.error(`Error processing ${entry.name}`, { error })
      }
    }
  }

  if (!filesFound) {
    show.info(`No JSON files found in ${flowiseImportDir}. Nothing to import.`)
  } else {
    show.info('Flowise workflow import completed.')
  }
}

async function importToFlowise(
  _projectName: string,
  { skipPrompt = false, archiveAfterImport = true }: {
    skipPrompt?: boolean
    archiveAfterImport?: boolean
  } = {},
): Promise<void> {
  const show = config.relayer.show
  if (!skipPrompt) {
    show.info('Importing Flowise chatflows from the import folder.')
    if (!show.confirm('Are you sure you want to continue?')) {
      show.info('Import cancelled')
      return
    }
  }

  try {
    // Check if Flowise is running by pinging the API
    show.info('Checking if Flowise is running...')
    try {
      const response = await fetch(`${FLOWISE_BASE_URL}/api/v1/ping`)
      if (!response.ok && (await response.text()) !== 'pong') {
        throw new Error(`Failed to ping Flowise API: ${response.status} ${response.statusText}`)
      }
      show.info('Flowise is running and appears ready for import')
    } catch (_error) {
      show.error('Error connecting to Flowise API', { error: FLOWISE_BASE_URL })
      show.info(`Please make sure Flowise is running and accessible at ${FLOWISE_BASE_URL}`)
      show.info('Import cancelled')
      return
    }

    const { apiKey } = await getFlowiseApiKey() || { apiKey: '' }
    await importFolder('CHATFLOW', { apiKey })
    await importFolder('MULTIAGENT', { apiKey })

    if (archiveAfterImport) {
      // Archive the import folder
      // This will clear the import folder and archive it to import/.imported
      // This prevents accidental overwriting of workflows and credentials
      // when import is run multiple times.
      await archiveFlowiseImportFolder()
    }
  } catch (error) {
    show.error('Error during import', { error })
    Deno.exit(1)
  }
}

export async function runImport(
  projectName: string,
  { skipPrompt = false, archive = true }: {
    skipPrompt?: boolean
    archive?: boolean
  } = {},
): Promise<void> {
  await config.prepareEnv()
  await importToFlowise(projectName, { skipPrompt, archiveAfterImport: archive })
}
