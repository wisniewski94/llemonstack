import { Config } from '@/core/config/config.ts'
import { tryDockerCompose, tryDockerComposePs } from '@/lib/docker.ts'
import { path } from '@/lib/fs.ts'
import { failure, success, TryCatchResult } from '@/lib/try-catch.ts'
import { ObservableStruct } from '@/lib/utils/observable.ts'
import {
  EnvVars,
  ExposeHost,
  IRepoConfig,
  IServiceActionOptions,
  IServiceOptions,
  IServiceState,
  ServiceConfig,
  ServiceStatusType,
} from '@/types'
import { getEndpoints, prepareVolumes, setupServiceRepo } from './utils/index.ts'

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

  protected _state: ObservableStruct<IServiceState> = new ObservableStruct<IServiceState>({
    enabled: false,
    started: false,
    healthy: false,
    ready: false,
    last_checked: null,
    state: null,
  })

  // Reference back to the active config object
  // This is here so services don't need to get the global config instance
  protected _configInstance: Config

  protected _dir: string
  protected _enabledInConfig: boolean

  protected _composeFile: string
  protected _profiles: string[] = []
  // protected _dependencies: ServicesMapType

  // Service's llemonstack.yaml config, once loaded it's frozen to prevent
  // accidental changes that are not saved
  readonly _config: ServiceConfig

  constructor(
    { serviceConfig, serviceDir, config, configSettings }: IServiceOptions,
  ) {
    this._name = serviceConfig.name
    this._service = serviceConfig.service
    this._description = serviceConfig.description

    // Set id to 'namespace/service' if not set in llemonstack.yaml
    this._id = serviceConfig.id ?? `${this.namespace}/${this._service}`

    this._configInstance = config // TODO: check for circular reference issues
    this._config = Object.freeze({ ...serviceConfig })
    this._dir = serviceDir
    this._composeFile = path.join(this._dir, serviceConfig.compose_file)

    // TODO: double check if this is the best way to handle this? now that _configInstance is being saved

    // Configure with settings from the service entry in config.json
    this._enabledInConfig = configSettings.enabled
    this.setProfiles(configSettings.profiles || [])
  }

  public toString(): string {
    return this.name
  }

  /**
   * Get the key used to store the service in a ServicesMap
   *
   * @returns {string} The key used to store the service in a ServicesMap
   */
  public get servicesMapKey(): string {
    return this._id
  }

  public get id(): string {
    return this._id
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

  public get repoConfig(): IRepoConfig | null {
    return this._config.repo ?? null
  }

  public get repoDir(): string | null {
    return this._config.repo?.dir
      ? path.join(this._configInstance.reposDir, this._config.repo?.dir)
      : null
  }

  public get repoBaseDir(): string {
    return this._configInstance.reposDir
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

  /**
   * Get the state for a key in the service state object
   *
   * If no key is specified, the status is returned.
   *
   * @param {keyof IServiceState} key - The key to get
   * @returns The value of the key
   */
  public getState(key: keyof IServiceState): IServiceState[keyof IServiceState] {
    return this._state.get(key)
  }

  /**
   * Set the state for a key in the service state object
   *
   * @param {keyof IServiceState} key - The key to set
   * @param {IServiceState[K]} value - The value to set
   * @returns {boolean} Whether or not the state was set, could return false if value was invalid
   */
  public setState<K extends keyof IServiceState>(key: K, value: IServiceState[K]): boolean {
    this._state.set(key, value)
    return true // Whether or not the state was set
  }

  public async getStatus(): Promise<ServiceStatusType> {
    await this.checkState()
    if (!this.isEnabled()) {
      return 'disabled'
    }
    if (this._state.get('started')) {
      const health = this._state.get('healthy')
      if (health === true) {
        return 'running'
      } else if (health === false) {
        return 'unhealthy'
      } else {
        return 'started'
      }
    }
    if (this._state.get('ready')) {
      return 'ready'
    }
    // TODO: add other states
    // Default status: 'loaded'
    // Service is enabled but prepareEnv has not yet successfully completed
    return 'loaded'
  }

  /**
   * Get or set the enabled status of the service
   *
   * Used a single method instead of get/set to make a more compact API.
   * Allows for ```config.getServiceByName('n8n')?.enabled(false)```
   *
   * @param value - Optional boolean value to set the enabled status
   * @returns The enabled status of the service
   */
  public isEnabled(): boolean {
    if (this._state.get('enabled')) {
      return true
    }

    // Check Deno env vars for ENABLED_<service>
    // TODO: remove this check once config script is working properly and
    // everything migrated to config.json
    const env = this._configInstance.env[`ENABLE_${this.service.toUpperCase().replace(/-/g, '_')}`]
    const enabled = env?.trim().toLowerCase() === 'true' || this._enabledInConfig

    // TODO: log a deprecation warning if env var check is used

    this._state.set('enabled', enabled)
    return enabled
  }

  public isStarted(): boolean {
    return this._state.get('started') || false
  }

  public async isRunning(): Promise<boolean> {
    await this.checkState()
    return this._state.get('started') || false
  }

  /**
   * Check the state of the service with Docker Compose and update the state object
   *
   * @returns {TryCatchResult<IServiceState>} - The result of the check
   */
  protected async checkState(): Promise<TryCatchResult<IServiceState>> {
    const results = success<IServiceState>(this._state as unknown as IServiceState)

    const serviceNames = this._config.provides
      ? Object.values(this._config.provides)
      : [this.service]
    const psResults = await tryDockerComposePs(
      this._configInstance.projectName,
      { services: serviceNames },
    )
    if (!psResults.success || !psResults.data) {
      this.setState('state', 'unknown')
      return failure(
        `Failed to update service state: ${this.name}`,
        results, // Return the current state
      )
    }

    // Use the ps results for the first service listed in provides key in llemonstack.yaml.
    // This first container is considered primary. e.g. supabase will check the db container.
    const data = psResults.data.find((c) => c.Service === serviceNames[0])
    // TODO: combine the status of all the matching services in the ps results?

    const state = data?.State ?? null
    this.setState('state', state)
    this.setState('started', state === 'running')
    this.setState('last_checked', new Date())
    this.setState('enabled', this.isEnabled())
    // TODO add more states checks here

    return results
  }

  /**
   * Get the first host matching the context
   *
   * By default, gets the first 'host' entry in the exposes config in llemonstack.yaml.
   * i.e. Returns the info for the main url exposed by the service on the host.
   *
   * @param {string} context - Dot object path for exposes in the service llemonstack.yaml config
   * @returns The container DNS host name and port, e.g. 'ollama:11434'
   */
  public getHostEndpoint(context: string = 'host.*'): ExposeHost {
    return this.getEndpoints(context)[0]
  }

  /**
   * Get all the endpoints matching the context
   *
   * Used by UI scripts and other services to discover the hosts and ports
   * this service is exposing to the host and internal to the stack.
   *
   * @example
   * ```ts
   * // Get all the endpoints exposed to the host
   * const endpoints = service.getEndpoints('host.*')
   * console.log(endpoints)
   *
   * // Get all the endpoints
   * const endpoints = service.getEndpoints('*.*')
   * console.log(endpoints)
   * ```
   *
   * @param {string} context - Dot object path for exposes in the service llemonstack.yaml config
   * @returns The container DNS host name and port, e.g. 'ollama:11434'
   */
  public getEndpoints(context: string = '*.*'): ExposeHost[] {
    return getEndpoints(this, context, this._configInstance.env)
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
   * Load the environment variables for the service
   *
   * @param {Record<string, string>} envVars - The environment variables to load
   * @param {Config} config - The config instance
   * @returns {Promise<Record<string, string>>} - The environment variables
   */
  // deno-lint-ignore require-await
  public async loadEnv(
    envVars: Record<string, string>,
    { config: _config }: { config: Config },
  ): Promise<Record<string, string>> {
    // Override in subclasses to set environment variables for the service
    return envVars
  }

  /**
   * Prepare the service environment
   *
   * @returns {TryCatchResult<boolean>} - The result of the preparation
   */
  public async prepareEnv(): Promise<TryCatchResult<boolean>> {
    const results = success<boolean>(true)

    results.collect([
      await this.prepareRepo(),
      await this.prepareVolumes(),
    ])

    if (!results.success) {
      return failure<boolean>(`Failed to prepare service environment: ${this.name}`, results, false)
    }

    this.setState('ready', true)
    results.addMessage('info', `✔️ ${this.name} environment prepared, ready to start`)
    return results
  }

  /**
   * Prepare the service repository
   *
   * @param {boolean} [pull=false] - Whether to update the repository to get the latest changes
   * @returns {TryCatchResult<boolean>} - The result of the preparation
   */
  public async prepareRepo(
    { pull = false }: { pull?: boolean } = {},
  ): Promise<TryCatchResult<boolean>> {
    // If no repo config, skip
    if (!this.repoConfig) {
      return success<boolean>(true)
    }

    return await setupServiceRepo(this, {
      pull,
      silent: true,
      createBaseDir: false, // Base dir is ensured in config
    })
  }

  /**
   * Prepare the service volumes
   *
   * @returns {TryCatchResult<boolean>} - The result of the preparation
   */
  protected async prepareVolumes(): Promise<TryCatchResult<boolean>> {
    // If no volumes, skip
    if (this.volumes.length === 0 && this.volumesSeeds.length === 0) {
      return success<boolean>(true)
    }

    return await prepareVolumes(this, this._configInstance.volumesDir)
  }

  //
  // Service Actions
  //
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
    const results = await tryDockerCompose('up', {
      projectName: this._configInstance.projectName,
      composeFile: this.composeFile,
      profiles: this.getProfiles(),
      ansi: 'never',
      args: ['-d'],
      env: envVars,
      silent,
      captureOutput: false,
    })
    if (results.success) {
      return success<boolean>(true, `${this.name} successfully started!`)
    }
    return failure<boolean>(`Failed to start service: ${this.name}`, results, false)
  }

  public async stopService(): Promise<TryCatchResult<boolean>> {
    const results = await tryDockerCompose('down', {
      composeFile: this.composeFile,
      projectName: this._configInstance.projectName,
      silent: true,
      captureOutput: true,
    })
    if (results.success) {
      return success<boolean>(true, `${this.name} successfully stopped!`)
    }
    return failure<boolean>(`Failed to stop service: ${this.name}`, results, false)
  }

  /**
   * Configure the service
   * @param {boolean} [silent] - Whether to run the configuration in silent or interactive mode
   * @returns {TryCatchResult<boolean>} - The result of the configuration
   */
  // deno-lint-ignore require-await
  public async configure(
    { silent: _silent }: IServiceActionOptions,
  ): Promise<TryCatchResult<boolean>> {
    return success<boolean>(true)
  }
}
