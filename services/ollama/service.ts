import { Select } from '@cliffy/prompt'
import { Config } from '../../scripts/lib/core/config/config.ts'
import { Service } from '../../scripts/lib/core/services/service.ts'
import { showHeader, showInfo, showWarning } from '../../scripts/lib/logger.ts'
import { success, TryCatchResult } from '../../scripts/lib/try-catch.ts'
import { EnvVars, ExposeHost, ServiceActionOptions } from '../../scripts/lib/types.d.ts'

export class OllamaService extends Service {
  /**
   * Get or set the enabled status of Ollama service
   *
   * @param value - Optional boolean value to set the enabled status
   * @returns The enabled status of the service
   */
  override enabled(value?: boolean): boolean {
    if (value !== undefined) {
      this._enabled = value
      return this._enabled
    }
    // Check if enabled has been set yet
    if (this._enabled !== null) {
      return this._enabled
    }
    // Set enabled to true if ENABLE_OLLAMA is not false
    const env = Config.getInstance().env['ENABLE_OLLAMA'].trim().toLowerCase()
    this._enabled = !(env === 'false') || this._configEnabled
    return this._enabled
  }

  /**
   * Get the Ollama host based on the current profile
   * @returns The Ollama host URL
   */
  override getHosts(_context: string): ExposeHost[] {
    // Use the OLLAMA_HOST env var if set, otherwise check Ollama profile settings
    const host =
      Config.getInstance().env['OLLAMA_HOST'] || (this.getProfiles()[0] === 'ollama-host')
        ? 'http://host.docker.internal:11434'
        : 'http://ollama:11434'
    return [{ url: host }]
  }

  // deno-lint-ignore require-await
  override async loadEnv(envVars: Record<string, string>): Promise<Record<string, string>> {
    envVars.OLLAMA_HOST = this.getHost()?.url
    return envVars
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
    { silent = false, config }: ServiceActionOptions,
  ): Promise<TryCatchResult<boolean>> {
    const gpuDisabled = config.os === 'macOS'

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
    this._enabled = !ollamaProfile.includes('disabled')

    return super.configure({ silent, config })
  }
}

export default OllamaService
