import { Service } from '@/core/services/mod.ts'
import { success, TryCatchResult } from '@/lib/try-catch.ts'
import { EnvVars, ExposeHost, IServiceActionOptions } from '@/types'
import { colors } from '@cliffy/ansi/colors'
import { Select } from '@cliffy/prompt'

export class OllamaService extends Service {
  /**
   * Get the Ollama host based on the current profile
   * @returns The Ollama host URL
   */
  override getEndpoints(_context: string): ExposeHost[] {
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
    envVars.OLLAMA_HOST = this.getHostEndpoint()?.url
    return envVars
  }

  /**
   * Start the service
   * @param {EnvVars} [envVars] - Environment variables to pass to the service
   * @param {boolean} [silent] - Whether to run the command in silent mode
   * @returns {TryCatchResult<boolean>} - The result of the command
   */
  override async start(
    { envVars = {}, silent = false, build = false }: {
      envVars?: EnvVars
      silent?: boolean
      build?: boolean
    } = {},
  ): Promise<TryCatchResult<boolean>> {
    if (this.getProfiles().includes('ollama-host')) {
      return success<boolean>(true, 'Skipping Ollama service start, using host bridge')
    }
    return await super.start({ envVars, silent, build })
  }

  /**
   * Configure the service
   * @param {boolean} [silent] - Whether to run the configuration in silent or interactive mode
   * @returns {TryCatchResult<boolean>} - The result of the configuration
   */
  override async configure(
    options: IServiceActionOptions,
  ): Promise<TryCatchResult<boolean>> {
    // If the service is disabled, skip the configuration
    if (!this.isEnabled()) {
      return super.configure(options)
    }

    const gpuDisabled = options.config.host.isMac()

    // Default to host when silent is true
    let ollamaProfile = 'host'

    if (!options.silent) {
      const { show } = options
      show.header('Ollama Configuration Options')
      show.info('Ollama can run on your host machine or inside a Docker container.')
      show.info('The host option requires manually starting ollama on your host machine.')
      show.info('If running in Docker, you can choose to run it on the CPU (slow) or a GPU (fast).')
      show.info("GPU options require a compatible GPU on the host... because it's not magic.\n")
      gpuDisabled &&
        show.warn('GPU options are not currently available on macOS due to Docker limitations.\n')

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

    return super.configure(options)
  }

  // deno-lint-ignore require-await
  override async showAdditionalInfo({ show, config }: IServiceActionOptions): Promise<void> {
    if (this.getProfiles()[0] === 'ollama-host') {
      const ollamaUrl = this.getHostEndpoint()?.url || ''
      show.userAction(`\nUsing host Ollama: ${colors.yellow(ollamaUrl)}`)
      show.userAction(`  Start Ollama on your computer: ${colors.green('ollama serve')}`)
      if (config.isEnabled('n8n')) {
        show.userAction(`  Set n8n Ollama credential url to: ${colors.yellow(ollamaUrl)}`)
        show.userAction(
          `  Or connect n8n to LiteLLM ${
            colors.yellow('http://litellm:4000')
          } to proxy requests to Ollama`,
        )
      }
    }
  }
}

export default OllamaService
