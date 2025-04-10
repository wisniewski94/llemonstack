import { Config } from '@/core/config/config.ts'
import { Service } from '@/core/services/service.ts'
import { path } from '@/lib/fs.ts'
import { failure, success } from '@/lib/try-catch.ts'
import { TryCatchResult } from '@/types'

export class FlowiseService extends Service {
  override async loadEnv(
    envVars: Record<string, string>,
    { config: _config }: { config: Config },
  ) {
    const result = await this.getApiKey()
    if (!result.success || !result.data) {
      return envVars
    }
    const { apiKey, keyName } = result.data
    envVars.FLOWISE_API_KEY = apiKey
    envVars.FLOWISE_API_KEY_NAME = keyName
    return envVars
  }

  /**
   * Get the Flowise API key from the config file
   *
   * @returns The Flowise API key or empty string if not found
   */
  public async getApiKey(): Promise<TryCatchResult<{ apiKey: string; keyName: string }>> {
    const results = success<{ apiKey: string; keyName: string }>({
      apiKey: '',
      keyName: '',
    })

    const config = this._configInstance

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
      results.data = {
        apiKey: config[0]?.apiKey || '',
        keyName: config[0]?.keyName || '',
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        results.addMessage('info', `Flowise config file not found: ${configPath}`)
      } else {
        results.error = error as Error
        return failure(`Error reading Flowise API key: ${error}`, results)
      }
    }

    return results
  }
}

export default FlowiseService
