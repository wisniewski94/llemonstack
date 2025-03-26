import { path } from './fs.ts'
import { RepoService, ServiceConfig, ServiceOptions } from './types.d.ts'

export class Service {
  public name: string // Human readable name
  public service: string // Service name
  public description: string // Service description

  private _dir: string
  private _config: ServiceConfig
  private _enabled: boolean | null = null
  protected _composeFile: string
  protected _repoDir: string | null = null
  protected _profiles: string[] = []

  constructor(
    { config, dir, enabled, repoBaseDir, llemonstackConfig }: ServiceOptions,
  ) {
    this.name = config.name
    this.service = config.service
    this.description = config.description
    this._enabled = enabled ?? null
    this._config = config
    this._dir = dir
    this._composeFile = path.join(this._dir, config.compose_file)
    this._repoDir = config.repo?.dir ? path.join(repoBaseDir, config.repo?.dir) : null
    this.setProfiles(llemonstackConfig.services[config.service]?.profiles || [])
  }

  public toString(): string {
    return this.name
  }

  get composeFile(): string {
    return this._composeFile
  }

  get enabled(): boolean {
    if (this._enabled !== null) {
      return this._enabled
    }
    const varName = `ENABLE_${this.service.toUpperCase().replace(/-/g, '_')}`
    const enabled = Deno.env.get(varName)?.trim().toLowerCase() === 'true'
    this._enabled = enabled
    return this._enabled
  }

  set enabled(enabled: boolean) {
    this._enabled = enabled
  }

  get config(): ServiceConfig {
    return this._config
  }

  get repoConfig(): RepoService | null {
    return this._config.repo ?? null
  }

  get repoDir(): string | null {
    return this._repoDir
  }

  get customStart(): boolean {
    return this._config.custom_start ?? false
  }

  get serviceGroup(): string {
    return this._config.service_group ?? ''
  }

  get volumes(): string[] {
    return this._config.volumes ?? []
  }

  get volumesSeeds(): { source: string; destination: string; from_repo?: true }[] {
    return this._config.volumes_seeds ?? []
  }

  get appVersionCmd(): string[] | null {
    return this._config.app_version_cmd ?? null
  }

  public loadEnv(envVars: Record<string, string>) {
    // Override in subclasses to set environment variables for the service
    return envVars
  }

  /**
   * Get the host and port for the service
   *
   * @param {string} [_subService] - Optional sub-service to get the host for
   * @returns The container DNS host name and port, e.g. 'ollama:11434'
   */
  getHost(_subService?: string): string {
    // TODO: get from the docker-compose.yaml file
    // Add support for returning multiple hosts. These are all the hosts & ports exposed to localhost.
    // For now, this is just a placeholder for subclasses to override
    return ''
  }

  /**
   * Get Docker Compose profiles for the service
   *
   * @returns Array of profiles, e.g. ['ollama-cpu']
   */
  getProfiles(): string[] {
    // Override in subclasses to return the profiles for the service
    return this._profiles
  }

  setProfiles(profiles: string[]) {
    this._profiles = profiles
  }
}
