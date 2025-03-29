import { Config } from '../../config.ts'
import { dockerCompose, expandEnvVars } from '../../docker.ts'
import { path } from '../../fs.ts'
import { searchObjectPaths } from '../../search-object.ts'
import { failure, success, TryCatchResult } from '../../try-catch.ts'
import {
  EnvVars,
  ExposeHost,
  IServiceOptions,
  RepoService,
  ServiceActionOptions,
  ServiceConfig,
  ServiceState,
} from '../../types.d.ts'
import { ObservableStruct } from '../../utils/observable.ts'

/**
 * Service
 *
 * Represents a service in the LLemonStack configuration.
 * Extends ObservableStruct to provide a state object that can be observed for changes.
 */
export class Service {
  protected namespace: string = 'llemonstack'
  protected _id: string // namespace/service
  protected _service: string // service name in llemonstack.yaml
  protected _name: string // Human readable name
  protected _description: string // Service description

  protected _state: ObservableStruct<ServiceState> = new ObservableStruct<ServiceState>({
    enabled: false,
    started: false,
    healthy: false,
    status: 'installed',
  })

  // Reference back to the active config object
  protected _stackConfig: Config

  protected _dir: string
  protected _configEnabled: boolean

  protected _composeFile: string
  protected _profiles: string[] = []
  // protected _dependencies: Map<Service.id, Service>

  // Service's llemonstack.yaml config, once loaded it's frozen to prevent
  // accidental changes that are not saved
  readonly _config: ServiceConfig

  constructor(
    { serviceConfig, serviceDir, config, configSettings }: IServiceOptions,
  ) {
    this._id = serviceConfig.id ?? this.id
    this._name = serviceConfig.name
    this._service = serviceConfig.service
    this._description = serviceConfig.description

    this._stackConfig = config // TODO: check for circular reference issues
    this._config = Object.freeze({ ...serviceConfig })
    this._dir = serviceDir
    this._composeFile = path.join(this._dir, serviceConfig.compose_file)

    // TODO: double check if this is the best way to handle this? now that _stackConfig is being saved

    // Configure with settings from the service entry in config.json
    this._configEnabled = configSettings.enabled
    this.setProfiles(configSettings.profiles || [])
  }

  public toString(): string {
    return this.name
  }

  public get state(): ObservableStruct<ServiceState> {
    return this._state
  }

  public get id(): string {
    return this._id || `${this.namespace}/${this._service}`
  }

  public get name(): string {
    return this._name || this._service || this.id
  }

  public get description(): string {
    return this._description || ''
  }

  public get service(): string {
    return this._service
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
    return this._config.repo?.dir
      ? path.join(this._stackConfig.reposDir, this._config.repo?.dir)
      : null
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

  public get depends_on(): string[] {
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
  // TODO: split into two methods: isEnabled() and setState('enabled', value)
  public enabled(value?: boolean): boolean {
    // Set the enabled state if value is provided
    if (value !== undefined) {
      this.state.set('enabled', value)
      return value
    }
    // Check if enabled has been set yet
    if (this.state.get('enabled') !== null) {
      return this.state.get('enabled')
    }
    // Check Deno env vars for ENABLED_<service>
    // Otherwise, use the initial config file setting
    // TODO: remove check to ENABLE_<service> once config script is working properly
    const env = Config.getInstance().env[`ENABLE_${this.service.toUpperCase().replace(/-/g, '_')}`]
    this.state.set('enabled', env?.trim().toLowerCase() === 'true' || this._configEnabled)
    return this.state.get('enabled')
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

    const env = Config.getInstance().env
    // Map each host to an ExposeHost object
    return data.map((item) => {
      const host = {
        _key: item.key,
        name: item.data.name || (item.key.split('.').pop() ?? ''),
        url: typeof item.data === 'string' ? item.data : item.data.url,
        info: item.data.info,
      } as ExposeHost

      if (host.url.includes('${')) {
        host.url = expandEnvVars(host.url, env)
      }
      if (host?.info?.includes('${')) {
        host.info = expandEnvVars(host.info, env)
      }

      // Expand credentials from env vars
      if (item.data.credentials) {
        host.credentials = {}
        Object.entries(item.data.credentials).forEach(([key, value]) => {
          host.credentials![key] = expandEnvVars(String(value), env)
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
      projectName: this._stackConfig.projectName,
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
