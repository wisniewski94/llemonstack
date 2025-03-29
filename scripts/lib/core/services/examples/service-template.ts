/**
 * Example Service template for creating new services
 */
import { Service } from '@/core'
import { EnvVars, ExposeHost, ServiceActionOptions } from '@/types'
// TODO: add TryCatch types to @types
// import { showHeader, showInfo, showWarning } from '../../scripts/lib/logger.ts'
import { success, TryCatchResult } from '../../scripts/lib/try-catch.ts'

export class ServiceStub extends Service {
  /**
   * Get the enabled status of the service
   * @returns The enabled status of the service
   */
  override isEnabled(): boolean {
    // Example checking an env var to determine if the service should be enabled
    const envValue = this._configInstance.env['SOME_ENV_VAR'].trim().toLowerCase()
    return envValue === 'custom'
  }

  /**
   * Get the host url for the service
   * @returns The host URL
   */
  override getHosts(_context: string): ExposeHost[] {
    // Example getting a custom host url from an env var
    const host =
      this._configInstance.env['SOME_SERVICE_HOST'] || (this.getProfiles()[0] === 'custom-host')
        ? 'http://host.docker.internal:1234'
        : 'http://service:1234'
    return [{ url: host }]
  }

  /**
   * Load environment variables for the service
   * @param envVars - The environment variables to load
   * @returns The environment variables
   */
  // deno-lint-ignore require-await
  override async loadEnv(envVars: Record<string, string>): Promise<Record<string, string>> {
    // Example setting a custom host url for other services or configs to use at runtime
    envVars.SOME_CUSTOM_SERVICE_ENV_HOST = this.getHost()?.url
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
    // Example skipping the start command if a custom host is used
    if (this.getProfiles().includes('custom-host')) {
      const results = success<boolean>(true)
      results.addMessage('info', `Skipping ${this.name} start, using host bridge`)
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
    { silent = false }: ServiceActionOptions,
  ): Promise<TryCatchResult<boolean>> {
    const gpuDisabled = this._configInstance.host.isMac()

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
