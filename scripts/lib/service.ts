import { Config } from './config.ts'
import { dockerCompose, expandEnvVars } from './docker.ts'
import { path } from './fs.ts'
import { searchObjectPaths } from './search-object.ts'
import { failure, success, TryCatchResult } from './try-catch.ts'
import {
  EnvVars,
  ExposeHost,
  RepoService,
  ServiceActionOptions,
  ServiceConfig,
  ServiceOptions,
} from './types.d.ts'

export class Service {
  public name: string // Human readable name
  public service: string // Service name
  public description: string // Service description

  protected _dir: string
  protected _config: ServiceConfig
  protected _configEnabled: boolean
  protected _projectName: string
  protected _enabled: boolean | null = null
  protected _composeFile: string
  protected _repoDir: string | null = null
  protected _profiles: string[] = []

  constructor(
    { config, dir, repoBaseDir, llemonstackConfig }: ServiceOptions,
  ) {
    this.name = config.name
    this.service = config.service
    this.description = config.description
    this._projectName = llemonstackConfig.projectName
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

  public get config(): ServiceConfig {
    return this._config
  }

  public get repoConfig(): RepoService | null {
    return this._config.repo ?? null
  }

  public get repoDir(): string | null {
    return this._repoDir
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

  //
  // Public Methods
  //

  // deno-lint-ignore require-await
  public async loadEnv(
    envVars: Record<string, string>,
    _config?: Config,
  ): Promise<Record<string, string>> {
    // Override in subclasses to set environment variables for the service
    return envVars
  }

  /**
   * Get or set the enabled status of the service
   *
   * Used a single method instead of get/set to make a more compact API.
   * Allows for ```config.getService('n8n')?.enabled(false)```
   *
   * @param value - Optional boolean value to set the enabled status
   * @returns The enabled status of the service
   */
  public enabled(value?: boolean): boolean {
    if (value !== undefined) {
      this._enabled = value
      return this._enabled
    }
    // Check if enabled has been set yet
    if (this._enabled !== null) {
      return this._enabled
    }
    // Check Deno env vars for ENABLED_<service>
    // Otherwise, use the initial config file setting
    const env = Config.getInstance().env[`ENABLE_${this.service.toUpperCase().replace(/-/g, '_')}`]
    this._enabled = env?.trim().toLowerCase() === 'true' || this._configEnabled
    return this._enabled
  }

  /**
   * Get the first host matching the context
   *
   * @param {string} context - Dot object path for exposes in the service llemonstack.yaml config
   * @returns The container DNS host name and port, e.g. 'ollama:11434'
   */
  public getHost(context?: string): ExposeHost {
    return this.getHosts(context)[0]
  }

  /**
   * Get all hosts matching the context
   *
   * @param {string} context - Dot object path for exposes in the service llemonstack.yaml config
   * @returns The container DNS host name and port, e.g. 'ollama:11434'
   */
  public getHosts(context?: string): ExposeHost[] {
    if (!context) {
      context = 'host.*'
    }

    // Get all hosts matching the context
    const data = searchObjectPaths<ExposeHost>(this._config.exposes, context)

    // Map each host to an ExposeHost object
    return data.map((item) => {
      const host = {
        name: item.data.name || (item.key.split('.').pop() ?? ''),
        url: typeof item.data === 'string' ? item.data : item.data.url,
      } as ExposeHost

      // Expand credentials from env vars
      if (item.data.credentials) {
        host.credentials = {}
        Object.entries(item.data.credentials).forEach(([key, value]) => {
          host.credentials![key] = expandEnvVars(String(value), Config.getInstance().env)
        })
      }

      return host
    })
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

  //
  // Service Actions
  // These methods are called by the CLI and can be overridden by subclasses.
  //

  /**
   * Start the service
   * @param {EnvVars} [envVars] - Environment variables to pass to the service
   * @param {boolean} [silent] - Whether to run the command in silent mode
   * @returns {TryCatchResult<boolean>} - The result of the command
   */
  public async start(
    { envVars = {}, silent = false }: {
      envVars?: EnvVars
      silent?: boolean
    } = {},
  ): Promise<TryCatchResult<boolean>> {
    const results = await dockerCompose('up', {
      projectName: this._projectName,
      composeFile: this.composeFile,
      profiles: this.getProfiles(),
      ansi: 'never',
      args: ['-d'],
      env: envVars,
      silent,
      captureOutput: false,
    })
    if (results.success) {
      return success<boolean>(true, `${this.name} started successfully!`)
    }
    return failure<boolean>(`Failed to start service: ${this.name}`, results, false)
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
