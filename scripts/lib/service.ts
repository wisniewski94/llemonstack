import { path } from './fs.ts'
import { success, TryCatchResult } from './try-catch.ts'
import { RepoService, ServiceActionOptions, ServiceConfig, ServiceOptions } from './types.d.ts'

export class Service {
  public name: string // Human readable name
  public service: string // Service name
  public description: string // Service description

  private _dir: string
  private _config: ServiceConfig
  private _configEnabled: boolean
  protected _enabled: boolean | null = null
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
    this._configEnabled = llemonstackConfig.services[config.service]?.enabled
    this.setProfiles(llemonstackConfig.services[config.service]?.profiles || [])
  }

  public toString(): string {
    return this.name
  }

  public get composeFile(): string {
    return this._composeFile
  }

  public get enabled(): boolean {
    if (this._enabled !== null) {
      return this._enabled
    }
    // Env vars override the config file settings
    const env = Deno.env.get(`ENABLE_${this.service.toUpperCase().replace(/-/g, '_')}`)
    this._enabled = env?.trim().toLowerCase() === 'true' || this._configEnabled || false
    return this._enabled
  }

  public set enabled(enabled: boolean) {
    this._enabled = enabled
  }

  public get config(): ServiceConfig {
    return this._config
  }

  public get repoConfig(): RepoService | null {
    return this._config.repo ?? null
  }

  public get repoDir(): string | null {
    return this._repoDir
  }

  public get customStart(): boolean {
    return this._config.custom_start ?? false
  }

  public get serviceGroup(): string {
    return this._config.service_group ?? ''
  }

  public get volumes(): string[] {
    return this._config.volumes ?? []
  }

  public get volumesSeeds(): { source: string; destination: string; from_repo?: true }[] {
    return this._config.volumes_seeds ?? []
  }

  public get appVersionCmd(): string[] | null {
    return this._config.app_version_cmd ?? null
  }

  public get dependencies(): string[] {
    return Object.keys(this._config.depends_on || {}) ?? []
  }

  public get provides(): string[] {
    return Object.keys(this._config.provides || {}) ?? []
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
  public getHost(_subService?: string): string {
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
  public getProfiles(): string[] {
    // Override in subclasses to return the profiles for the service
    return this._profiles
  }

  public setProfiles(profiles: string[]) {
    this._profiles = profiles
  }

  /**
   * Configure the service
   * @param {boolean} [silent] - Whether to run the configuration in silent or interactive mode
   * @returns {TryCatchResult<boolean>} - The result of the configuration
   */
  // deno-lint-ignore require-await
  public async configure(
    // deno-lint-ignore no-unused-vars
    { silent = false, config }: ServiceActionOptions,
  ): Promise<TryCatchResult<boolean>> {
    return success<boolean>(true)
  }
}
