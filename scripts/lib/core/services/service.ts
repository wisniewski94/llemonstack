import { Config } from '@/core/config/config.ts'
import { setupServiceRepo } from '@/core/services/repo.ts'
import { dockerCompose, expandEnvVars } from '@/lib/docker.ts'
import { fs, path } from '@/lib/fs.ts'
import { searchObjectPaths } from '@/lib/search-object.ts'
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
   * @param {boolean} value - The value to set
   * @returns {boolean} Whether or not the state was set, could return false if value was invalid
   */
  public setState(key: keyof IServiceState, value: boolean): boolean {
    this._state.set(key, value)
    return true // Whether or not the state was set
  }

  public getStatus(): ServiceStatusType {
    if (!this.isEnabled()) {
      return 'disabled'
    }
    if (this._state.get('started')) {
      if (this._state.get('healthy')) {
        return 'started:healthy'
      } else {
        return 'started:unhealthy'
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

  // TODO: rename this to prepareEnv ??? loadEnv gets confusing as to when it's called
  // deno-lint-ignore require-await
  public async loadEnv(
    envVars: Record<string, string>,
    { config: _config }: { config: Config },
  ): Promise<Record<string, string>> {
    // Override in subclasses to set environment variables for the service
    return envVars
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

    this._state.set('ready', true)
    results.addMessage('info', `Service ${this.name} environment prepared, ready to start`)
    return results
  }

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
    })
  }

  protected async prepareVolumes(): Promise<TryCatchResult<boolean>> {
    const results = success<boolean>(true)

    const volumesPath = this._configInstance.volumesDir

    results.addMessage('info', 'Checking for required volumes...')
    results.addMessage('debug', `Volumes base path: ${volumesPath}`)

    const getRelativePath = (pathStr: string): string => {
      return path.relative(Deno.cwd(), pathStr)
    }

    // Get all enabled services that have volumes or seeds
    if (this.volumes.length === 0 || this.volumesSeeds.length === 0) {
      return results
    }

    results.addMessage('info', `Creating required volumes for ${this.name}...`)

    // Create any required volume dirs
    for (const volume of this.volumes) {
      const volumePath = path.join(volumesPath, volume)
      try {
        const fileInfo = await Deno.stat(volumePath)
        if (fileInfo.isDirectory) {
          results.addMessage('debug', `✔️ ${volume}`)
        } else {
          return failure<boolean>(`Volume is not a directory: ${volumePath}`, results, false)
        }
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          await Deno.mkdir(volumePath, { recursive: true })
          results.addMessage('info', `Created missing volume dir: ${volumePath}`)
        } else {
          results.error = error as Error
          return failure<boolean>(`Error creating volume dir: ${volumePath}`, results, false)
        }
      }
    }

    // Copy any seed directories if needed
    for (const seed of this.volumesSeeds) {
      const seedPath = path.join(this._configInstance.volumesDir, seed.destination)
      try {
        // Check if seedPath already exists before copying
        const seedPathExists = await fs.exists(seedPath)
        if (seedPathExists) {
          results.addMessage('debug', `Volume seed already exists: ${getRelativePath(seedPath)}`)
          continue
        }
        let seedSource = seed.source
        if (seed.from_repo && this.repoDir) {
          seedSource = path.join(this.repoDir, seed.source)
        } else {
          return failure<boolean>(
            `Volume seed requires repo to exist: ${seed.source}`,
            results,
            false,
          )
        }
        await fs.copy(seedSource, seedPath, { overwrite: false })
        results.addMessage(
          'info',
          `Copied ${getRelativePath(seedSource)} to ${getRelativePath(seedPath)}`,
        )
      } catch (error) {
        results.error = error as Error
        return failure<boolean>(
          `Error copying seed: ${getRelativePath(seed.source)} to ${getRelativePath(seedPath)}`,
          results,
          false,
        )
      }
    }

    return results
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
    const results = await dockerCompose('down', {
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
