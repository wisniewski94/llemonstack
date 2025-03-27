import { Select } from '@cliffy/prompt'
import { showHeader, showInfo, showWarning } from '../../scripts/lib/logger.ts'
import { Service } from '../../scripts/lib/service.ts'
import { TryCatchResult } from '../../scripts/lib/try-catch.ts'
import { ServiceActionOptions } from '../../scripts/lib/types.d.ts'

export class OllamaService extends Service {
  override get enabled(): boolean {
    // If the profile is ollama-host, then the service is disabled and
    // will not try to start the docker container.
    return (this.getProfiles()[0] === 'ollama-host') ? false : !!this._enabled
  }

  override set enabled(enabled: boolean) {
    this._enabled = enabled
  }

  /**
   * Get the Ollama host based on the current profile
   * @returns The Ollama host URL
   */
  override getHost(): string {
    // Use the OLLAMA_HOST env var if it is set, otherwise check Ollama profile settings
    const host = Deno.env.get('OLLAMA_HOST') || (this.getProfiles()[0] === 'ollama-host')
      ? 'host.docker.internal:11434'
      : 'ollama:11434'
    return host
  }

  /**
   * Get the current Ollama profile
   * @returns The profile
   */
  // override getProfiles(): OllamaProfile[] {
  //   // TODO: pass the updated profile to Config to save it
  //   return [`ollama-${Deno.env.get('ENABLE_OLLAMA')?.trim() || 'false'}`] as OllamaProfile[]
  // }

  override loadEnv(envVars: Record<string, string>) {
    envVars.OLLAMA_HOST = this.getHost()
    Deno.env.set('OLLAMA_HOST', envVars.OLLAMA_HOST)
    return envVars
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
