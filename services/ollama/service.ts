import { Service } from '@/core/services/index.ts'
import { EnvVars, ExposeHost, IServiceActionOptions } from '@/types'
import { Select } from '@cliffy/prompt'
import { showHeader, showInfo, showWarning } from '../../scripts/lib/logger.ts'
import { success, TryCatchResult } from '../../scripts/lib/try-catch.ts'

export class OllamaService extends Service {
  /**
   * Get or set the enabled status of Ollama service
   *
   * @param value - Optional boolean value to set the enabled status
   * @returns The enabled status of the service
   */
  override isEnabled(): boolean {
    // Skip the env check if already enabled
    let enabled = this._state.get('enabled')
    if (enabled) {
      return true
    }
    // Set enabled to true if ENABLE_OLLAMA is not false
    // Otherwise default to the enabled setting in the project config file
    const env = this._configInstance.env['ENABLE_OLLAMA'].trim().toLowerCase()
    enabled = !(env === 'false') || this._enabledInConfig
    this.setState('enabled', enabled)
    return enabled
  }

  /**
   * Get the Ollama host based on the current profile
   * @returns The Ollama host URL
   */
  override getHosts(_context: string): ExposeHost[] {
    // Use the OLLAMA_HOST env var if set, otherwise check Ollama profile settings
    const host =
      this._configInstance.env['OLLAMA_HOST'] || (this.getProfiles()[0] === 'ollama-host')
        ? 'http://host.docker.internal:11434'
        : 'http://ollama:11434'
    return [{ url: host }]
  }

  /**
   * Get the host profile
   * @returns The host profile
   */
  public useHostOllama(): boolean {
    return this.getProfiles()[0] === 'ollama-host'
  }

  // deno-lint-ignore require-await
  override async loadEnv(envVars: Record<string, string>): Promise<Record<string, string>> {
    envVars.OLLAMA_HOST = this.getHost()?.url
    return envVars
  }

  // TODO: remove this after done testing
  override async prepareEnv(): Promise<TryCatchResult<boolean>> {
    this._state.set('ready', true)
    // Sleep for 3 seconds to ensure Ollama is ready

    console.time(`Waiting for ${this.name}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    console.time(`Waiting for ${this.name}`)
    // console.time(`${this.name} should now be ready after waiting`)

    console.log(`${this.name} is ready in prepareEnv`)

    // return failure<boolean>(
    //   'Failed to wait for ollama',
    //   TryCatchResult.from<boolean, Error>({
    //     data: false,
    //     error: new Error('Failed to wait for ollama'),
    //     success: false,
    //   }),
    // )
    // Override in subclasses to prepare the service environment
    return success<boolean>(true)
  }

  /**
   * Start the service
   * @param {EnvVars} [envVars] - Environment variables to pass to the service
   * @param {boolean} [silent] - Whether to run the command in silent mode
   * @returns {TryCatchResult<boolean>} - The result of the command
   */
  override async start(
    { envVars = {}, silent = false }: {
      envVars?: EnvVars
      silent?: boolean
    } = {},
  ): Promise<TryCatchResult<boolean>> {
    if (this.getProfiles().includes('ollama-host')) {
      const results = success<boolean>(true)
      results.addMessage('info', 'Skipping Ollama service start, using host bridge')
      return results
    }
    return await super.start({ envVars, silent })
  }

  /**
   * Configure the service
   * @param {boolean} [silent] - Whether to run the configuration in silent or interactive mode
   * @returns {TryCatchResult<boolean>} - The result of the configuration
   */
  override async configure(
    { silent = false, config }: IServiceActionOptions,
  ): Promise<TryCatchResult<boolean>> {
    const gpuDisabled = config.host.isMac()

    // Default to host when silent is true
    let ollamaProfile = 'host'

    if (!silent) {
      showHeader('Ollama Configuration Options')
      showInfo('Ollama can run on your host machine or inside a Docker container.')
      showInfo('The host option requires manually starting ollama on your host machine.')
      showInfo('If running in Docker, you can choose to run it on the CPU (slow) or a GPU (fast).')
      showInfo("GPU options require a compatible GPU on the host... because it's not magic.\n")
      gpuDisabled &&
        showWarning('GPU options are not currently available on macOS due to Docker limitations.\n')

      const gpuMessage = gpuDisabled ? ' (not available on macOS)' : ''
      ollamaProfile = await Select.prompt({
        message: 'How do you want to run Ollama?',
        options: [
          Select.separator('----- Run on Host 🖥️ -----'),
          {
            name: '[HOST] Creates a network bridge',
            value: 'ollama-host',
          },
          Select.separator('----- Run in Docker Container 🐳 -----'),
          { name: '[CPU] Run on CPU, slow but compatible', value: 'cpu' },
          {
            name: `[AMD] Run on AMD GPU ${gpuMessage} `,
            value: 'ollama-gpu-amd',
            disabled: gpuDisabled,
          },
          {
            name: `[NVIDIA] Run on Nvidia GPU ${gpuMessage}`,
            value: 'ollama-gpu-nvidia',
            disabled: gpuDisabled,
          },
        ],
      })
    }

    this.setProfiles([ollamaProfile])
    this.setState('enabled', !ollamaProfile.includes('disabled'))

    return super.configure({ silent, config })
  }
}

export default OllamaService
