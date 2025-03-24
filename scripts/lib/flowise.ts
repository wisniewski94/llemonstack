import { Config } from './config/config.ts'
import { path } from './fs.ts'
import { showDebug, showError } from './logger.ts'

const config = Config.getInstance()
await config.initialize()

const DEBUG = config.DEBUG

/**
 * Get the Flowise API key from the config file
 *
 * @returns The Flowise API key or empty string if not found
 */
export async function getFlowiseApiKey(): Promise<{ apiKey: string; keyName: string } | null> {
  const configPath = path.join(
    config.volumesDir,
    'flowise',
    'config',
    'api.json',
  )
  try {
    // Read and parse the config file
    const fileContent = await Deno.readTextFile(configPath)
    const config = JSON.parse(fileContent)
    // Extract the API key
    return {
      apiKey: config[0]?.apiKey || '',
      keyName: config[0]?.keyName || '',
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      DEBUG && showDebug(`Flowise config file not found: ${configPath}`)
      return null
    }
    showError('Error reading Flowise API key:', error)
    return null
  }
}
