import { Service } from '../../scripts/lib/service.ts'
import { OllamaProfile, ServiceConfig } from '../../scripts/lib/types.d.ts'

export class OllamaService extends Service {
  constructor(
    { config, dir, enabled, repoBaseDir }: {
      config: ServiceConfig
      dir: string
      enabled?: boolean
      repoBaseDir: string
    },
  ) {
    super({ config, dir, enabled, repoBaseDir })
  }

  override get enabled(): boolean {
    return ['ollama-false', 'ollama-host'].includes(this.getProfiles()[0])
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
  override getProfiles(): OllamaProfile[] {
    return [`ollama-${Deno.env.get('ENABLE_OLLAMA')?.trim() || 'false'}`] as OllamaProfile[]
  }

  override loadEnv(envVars: Record<string, string>) {
    envVars.OLLAMA_HOST = this.getHost()
    Deno.env.set('OLLAMA_HOST', envVars.OLLAMA_HOST)
    return envVars
  }
}

export default OllamaService
