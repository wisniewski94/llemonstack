import { Service, ServicesMap } from '@/core/services/mod.ts'
import { prepareDockerNetwork } from '@/lib/docker.ts'
import { loadEnv } from '@/lib/env.ts'
import * as fs from '@/lib/fs.ts'
import { failure, success, TryCatchResult } from '@/lib/try-catch.ts'
import { isTruthy } from '@/lib/utils/compare.ts'
import { LogLevel } from '@/relayer/logger.ts'
import { Relayer } from '@/relayer/relayer.ts'
import {
  IServiceConfigState,
  IServiceOptions,
  IServicesGroups,
  LLemonStackConfig,
  ServiceYaml,
} from '@/types'
import packageJson from '@packageJson' with { type: 'json' }
import configTemplate from '@templateConfig' with { type: 'json' }
import { deepMerge } from 'jsr:@std/collections/deep-merge'
import Host from './host.ts'

const SERVICE_CONFIG_FILE_NAME = 'llemonstack.yaml'

// Absolute path to root of install dir
const INSTALL_DIR = fs.path.join(
  fs.path.dirname(fs.path.fromFileUrl(import.meta.url)),
  '../../../',
)

/**
 * Config
 *
 * The Config class is responsible for loading the project config and services.
 * It also provides an API for access the config and services settings.
 */
export class Config {
  //
  // Static Properties: Config.*
  //

  static readonly defaultProjectName: string = 'llemonstack'
  static readonly defaultConfigFilePath: string = '.llemonstack/config.json'
  static readonly llemonstackVersion: string = packageJson.version
  private static instance: Config

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config()
    }
    return Config.instance
  }

  //
  // Instance Properties: this.*
  //

  protected _relayer: InstanceType<typeof Relayer> | null = null

  private _host: Host = Host.getInstance()

  public LOG_LEVEL: LogLevel = 'info'
  private _configTemplate: LLemonStackConfig = configTemplate as LLemonStackConfig
  private _config: LLemonStackConfig = this._configTemplate

  private _services: ServicesMap = new ServicesMap()

  // Caches
  private _servicesLookup: Map<string, string> = new Map() // Maps service.service to serve.id
  private _env: Record<string, string> = {}
  private _initializeResult: TryCatchResult<boolean, Error> | null = null

  private _serviceGroups: IServicesGroups = new Map([
    ['databases', new ServicesMap()],
    ['middleware', new ServicesMap()],
    ['apps', new ServicesMap()],
  ])

  // Map of service id to services that depend on it
  // Auto populated when services are registered
  // <service.id>: ServicesMap<services that depend on service.id>
  private _dependencies: Map<string, ServicesMap> = new Map()

  // Provider fulfillment map - when services load, they register as the primary provider
  // The last service loaded that fulfills the dependency will be used.
  // e.g. postgres -> [Service<supabase>, 'db'] - db is the container name for the service
  private _providers: Map<string, [Service, string]> = new Map()

  // Services that are enabled when a dependent service is enabled
  private _autoEnabledServices: ServicesMap = new ServicesMap()

  // Base configuration
  protected _configDir: string = ''
  protected _configFile: string = ''

  readonly installDir = INSTALL_DIR

  private constructor() {
    // Set the default config file path
    this.setConfigFile(Config.defaultConfigFilePath)
  }

  /**
   * Set the config dir and config file path to absolute path
   * @param configFile - The path to the config file
   */
  protected setConfigFile(configFile: string) {
    this._configFile = fs.path.resolve(Deno.cwd(), configFile)
    this._configDir = fs.path.dirname(this._configFile)
  }

  //
  // Public Properties
  //

  get DEBUG(): boolean {
    return this.LOG_LEVEL === 'debug'
  }

  /**
   * Get the project name from config.json, env, or default
   * @returns {string}
   */
  get projectName(): string {
    return this._config.projectName || Config.defaultProjectName
  }

  get configFile(): string {
    return this._configFile
  }

  get configDir(): string {
    return this._configDir
  }

  get envFile(): string {
    return fs.path.resolve(Deno.cwd(), this._config.envFile)
  }

  get dockerNetworkName(): string {
    return `${this.projectName}_network`
  }

  get reposDir(): string {
    return fs.path.resolve(Deno.cwd(), this._config.dirs.repos)
  }

  /**
   * Get the list of directories containing service config files
   *
   * @returns {string[]} List of service directory absolute paths in order of priority
   */
  get servicesDirs(): string[] {
    const dirs: string[] = []
    if (this._config.dirs.services) {
      const configDirs = Array.isArray(this._config.dirs.services)
        ? this._config.dirs.services
        : [this._config.dirs.services]
      for (const dir of configDirs) {
        if (dir) {
          dirs.push(fs.path.resolve(Deno.cwd(), dir))
        }
      }
    }
    dirs.push(fs.path.join(this.installDir, 'services'))
    return dirs
  }

  get importDir(): string {
    return fs.path.resolve(Deno.cwd(), this._config.dirs.import)
  }

  get sharedDir(): string {
    return fs.path.resolve(Deno.cwd(), this._config.dirs.shared)
  }

  get volumesDir(): string {
    return fs.path.resolve(Deno.cwd(), this._config.dirs.volumes)
  }

  get project(): LLemonStackConfig {
    return this._config
  }

  get env(): Record<string, string> {
    return this._env
  }

  // Returns the LLemonStack version for the current project
  get version(): string {
    return this._config.version || Config.llemonstackVersion
  }

  /**
   * Get the host platform
   * @returns macOS | Linux | Windows | other
   */
  get host(): Host {
    if (this._host) {
      return this._host
    }
    this._host = new Host()
    return this._host
  }

  /**
   * Get the root relayer instance with the project name set
   */
  get relayer(): InstanceType<typeof Relayer> {
    if (!this._relayer) {
      this._relayer = Relayer.getInstance()
    }
    this._relayer.setContextKey('projectName', this.projectName)
    return this._relayer
  }

  //
  // Public Methods
  //

  // Check if config.json has been initialized by init script
  public isProjectInitialized(): boolean {
    return !!this._config.initialized.trim()
  }

  public async initializeProject() {
    this._config.initialized = new Date().toISOString()
    return await this.save()
  }

  /**
   * Initialize the config
   *
   * It should be called at the start of any CLI script.
   * @returns {Promise<Config>}
   */
  public async initialize(
    configFile?: string,
    { logLevel = 'info', init = false, relayer }: {
      logLevel?: LogLevel // TODO: move logLevel to Relayer
      init?: boolean // If false, return error if config file is invalid
      relayer?: InstanceType<typeof Relayer>
    } = {},
  ): Promise<TryCatchResult<boolean, Error>> {
    if (relayer) {
      this._relayer = relayer
    }

    // If previously cached initialize result, return it
    if (this._initializeResult && this._initializeResult.success) {
      return this._initializeResult
    }

    if (logLevel) {
      this.LOG_LEVEL = logLevel
    }

    // Create a result object to add messages to
    const result = new TryCatchResult<boolean, Error>({ data: true, error: null, success: true })

    result.addMessage('debug', 'INITIALIZING CONFIG: this log message should only appear once')

    if (configFile) {
      this.setConfigFile(configFile)
    }

    let updated = false // Track if the project config was updated and needs to be saved

    // Load project config file
    const readResult = await fs.readJson<LLemonStackConfig>(this.configFile)

    if (readResult.data) {
      this._config = readResult.data
    } else if (readResult.error instanceof Deno.errors.NotFound) {
      // Return error if not initializing from template
      if (!init) {
        // Preserve the NotFound error
        result.error = readResult.error
        return failure(`Config file not found: ${this.configFile}`, result, false)
      }
      // Populate config from the template
      this._config = this._configTemplate
      result.addMessage('info', 'Project config file not found, creating from template')
      updated = true
    } else {
      result.error = readResult.error
    }

    // Check if project config is valid
    if (!this.isValidConfig()) {
      // Return error if not initializing from template
      if (!init) {
        return failure(`Project config file is invalid: ${this.configFile}`, result, false)
      }
      this.updateConfig(this._configTemplate)
      result.addMessage('info', 'Project config file is invalid, updating from template')
      updated = true
    }

    // Load .env file
    await this.loadEnv()

    // Update DEBUG flag from env vars if not already enabled
    // TODO: update Relayer if log level has changed & reset the Relayer config
    if (!this.DEBUG) {
      if (isTruthy(this.env.LLEMONSTACK_DEBUG)) {
        this.LOG_LEVEL = 'debug'
        result.addMessage('debug', 'DEBUG enabled in LLEMONSTACK_DEBUG env var')
      } else if (isTruthy(this.env.DEBUG)) {
        this.LOG_LEVEL = 'debug'
        result.addMessage('debug', 'DEBUG enabled in DEBUG env var')
      }
    }

    // Check if LLEMONSTACK_PROJECT_NAME env var is out of sync with project name in config.json
    // The name in config.json take precedence. LLemonStack automatically sets LLEMONSTACK_PROJECT_NAME
    // in the in memory env object for docker-compose.yaml files to use. User should remove
    // LLEMONSTACK_PROJECT_NAME in .env file to avoid confusion and potential conflicts with any
    // services incorrectly access LLEMONSTACK_PROJECT_NAME from Deno.env instead of config.env.
    const _projectName = Deno.env.get('LLEMONSTACK_PROJECT_NAME')
    if (_projectName && this.projectName !== _projectName) {
      result.addMessage(
        'warning',
        'Project name is out of sync in config.json and env var: LLEMONSTACK_PROJECT_NAME',
      )
      result.addMessage('warning', `config.json: "${this.projectName}"`)
      result.addMessage('warning', `env: "${_projectName}"`)
      result.addMessage(
        'info',
        'Using project name from config.json. Please manually update your .env file and remove LLEMONSTACK_PROJECT_NAME env var.',
      )
    }

    // Load services from services Directory
    result.collect([
      await this.loadServices(),
    ])

    // Load enabled services env, skipping .env file
    await this.loadEnv({ envPath: null })

    if (updated) {
      // Save and collect messages
      result.collect([
        await this.save(),
      ])
      if (!result.success) {
        return failure(`Error saving project config file: ${this.configFile}`, result, false)
      }
    }

    result.addMessage('debug', 'CONFIG INITIALIZED')

    if (!result.success) {
      return failure(`Error loading project config file: ${this.configFile}`, result)
    }

    // Cache the initialized result so scripts can process messages
    this._initializeResult = result

    return result
  }

  /**
   * Load services from services directory
   * @returns {Promise<TryCatchResult<Record<string, Service>>>}
   */
  public async loadServices(): Promise<TryCatchResult<Record<string, Service>>> {
    const result = new TryCatchResult<Record<string, Service>>({
      data: {},
      error: null,
      success: true,
    })

    // Load services from services directory in reverse order of priority
    // Higher priority services will override lower priority services
    const servicesDirs = this.servicesDirs.reverse()

    // TODO: refactor into helper functions, run in parallel
    for (const servicesDir of servicesDirs) {
      // Get list of services in services directory
      const servicesDirResult = await fs.readDir(servicesDir)
      if (servicesDirResult.error || !servicesDirResult.data) {
        return failure<Record<string, Service>>(
          'Error reading services directory',
          {
            data: null,
            error: servicesDirResult.error || new Error('Empty directory'),
            success: false,
          },
        )
      }

      // Load services from services directory
      for await (const serviceDir of servicesDirResult.data) {
        if (!serviceDir.isDirectory) {
          continue
        }
        const yamlFilePath = fs.path.join(servicesDir, serviceDir.name, SERVICE_CONFIG_FILE_NAME)
        if (!(await fs.fileExists(yamlFilePath)).data) {
          result.addMessage('debug', `Service config file not found: ${serviceDir.name}`)
          continue
        }
        const yamlResult = await fs.readYaml<ServiceYaml>(
          yamlFilePath,
        )
        if (!yamlResult.success || !yamlResult.data) {
          result.addMessage('error', `Error reading service config file: ${serviceDir.name}`, {
            error: yamlResult.error,
          })
          continue
        }

        const serviceYaml = yamlResult.data

        if (serviceYaml.disabled) {
          result.addMessage('debug', `Service ${serviceYaml.service} is disabled, skipping`)
          continue
        } else {
          result.addMessage(
            'debug',
            `${serviceYaml.name} loaded into ${serviceYaml.service_group} group`,
          )
        }

        const serviceConfig = this._config.services[serviceYaml.service] || {}

        // Create Service constructor options
        const serviceOptions: IServiceOptions = {
          serviceYaml,
          serviceDir: fs.path.join(servicesDir, serviceYaml.service),
          config: this,
          configSettings: serviceConfig,
          enabled: serviceConfig.enabled !== false, // Enable service unless explicitly disabled
        }

        // Check if there's a custom service implementation in the service directory
        const serviceImplPath = fs.path.join(servicesDir, serviceDir.name, 'service.ts')
        const serviceImplExists = (await fs.fileExists(serviceImplPath)).data

        if (serviceImplExists) {
          try {
            // Dynamically import the service implementation
            const serviceModule = await import(`file://${serviceImplPath}`)
            const ServiceClass = Object.values(serviceModule)[0] as typeof Service

            if (ServiceClass && typeof ServiceClass === 'function') {
              const service = new ServiceClass(serviceOptions)
              this.registerService(service)

              result.addMessage(
                'debug',
                `Using custom service implementation for ${serviceYaml.service}`,
              )
              continue // Skip the default Service instantiation below
            }
          } catch (error) {
            result.addMessage(
              'error',
              `Error loading custom service implementation for ${serviceYaml.service}`,
              {
                error,
              },
            )
          }
        }

        // Load the default Service class if no custom implementation exists
        const service = new Service(serviceOptions)

        this.registerService(service)
      }
    }

    // After all services are loaded, update the dependencies map
    this.updateDependencies()

    // After all services are loaded, update the auto enabled services
    this.updateAutoEnabledServices()

    return result
  }

  /**
   * Register a new service with the config
   * @param {Service} service - The service to register
   */
  public registerService(service: Service): boolean {
    const added = this._services.addService(service)
    if (added) {
      this._servicesLookup.set(service.service, service.servicesMapKey)
    }

    // Add service to service group
    const group = this._serviceGroups.has(service.serviceGroup)
      ? this._serviceGroups.get(service.serviceGroup)
      : new ServicesMap()

    // Add service to service group, if it already exists it will be replaced
    group!.addService(service, { force: true })

    // Add service to provider map
    // Adds ['postgres' => [Service<supabase>, 'db']]
    service.provides.forEach(([provides, container]) => {
      this._providers.set(provides, [service, container])
    })

    // Add service to auto enabled services map
    if (this._config.services[service.service]?.enabled === 'auto') {
      this._autoEnabledServices.addService(service)
    }

    // TODO: log warning if service is not added
    return added
  }

  public updateDependencies() {
    // Walk through each enabled service and populate _dependencies with providers
    // e.g. n8n depends on postgres, so it will check _providers for postgres and get [Service<supabase>, 'db']
    // Then update _dependencies<supabase.id> with n8n
    for (const [_, service] of this.getAllServices()) {
      // Get the list of services the service depends on
      // e.g. n8n depends on postgres, so it will check _providers for postgres and get [Service<supabase>, 'db']
      // Then update _dependencies<supabase.id> with n8n
      service.depends_on.forEach((dependency) => {
        const [serviceProvider, _] = this._providers.get(dependency) || []
        if (serviceProvider) {
          this.getServiceDependents(serviceProvider).addService(service)
        }
      })
    }
  }

  public getServiceDependents(service: Service): ServicesMap {
    let dependents = this._dependencies.get(service.id)
    if (!dependents) {
      dependents = new ServicesMap()
      this._dependencies.set(service.id, dependents)
    }
    return dependents
  }

  /**
   * Enable auto enabled services that have enabled dependencies
   */
  public updateAutoEnabledServices(): void {
    // For each service that is auto enabled, check if it has any enabled dependencies
    // If it does, enable the service
    // If it doesn't, disable the service
    for (const [_, service] of this._autoEnabledServices) {
      const enabledDependencies = this._dependencies.get(service.id)?.getEnabled()
      if (enabledDependencies && enabledDependencies.size > 0) {
        service.setState('enabled', true)
      } else {
        service.setState('enabled', false)
      }
    }
  }

  /**
   * Check if a service is auto enabled
   * @param {Service} service - The service to check
   * @returns {boolean} True if the service is auto enabled, false otherwise
   */
  public isServiceAutoEnabled(service: Service): boolean {
    return this._autoEnabledServices.has(service.id)
  }

  /**
   * Load the env vars for the project and all enabled services
   *
   * Loads into this.env
   * @param {Object} options - Options object
   * @param {string} options.envPath - The path to the .env file, set to null to skip loading the .env file
   * @param {boolean} options.reload - Reload the env vars from the .env file into Deno.env
   * @param {boolean} options.expand - Expand the env vars
   * @returns {Promise<Record<string, string>>}
   */
  public async loadEnv(
    {
      envPath = this.envFile, // Set to null to skip loading the .env file
      reload = false,
      expand = true,
    }: {
      envPath?: string | null
      reload?: boolean
      expand?: boolean
    } = {},
  ): Promise<Record<string, string>> {
    // Load .env file or use a clone of the current env vars
    const env = (!envPath) ? { ...this._env } : await loadEnv({ envPath, reload, expand })

    // Populate project name from config for services & docker to use
    env.LLEMONSTACK_PROJECT_NAME = this.projectName

    // TODO: populate global env vars like DEBUG, LOG_LEVEL, etc. ???

    // TODO: load Services env by service group, this will allow services that depend on
    // lower level services to discover the env settings if needed?

    // Call loadEnv on all enabled services
    // Allow services to modify the env vars as needed
    for (const [_, service] of this.getEnabledServices()) {
      // Use a proxy to intercept env var changes and update Deno.env
      await service.loadEnv(
        new Proxy(env, {
          set: (target, prop, value) => {
            target[prop as string] = value
            // TODO: think through wether Deno.env should be set or not.
            // This could cause issues with services stomping on each other's env vars.
            // But maybe that's a good thing?
            Deno.env.set(prop as string, value)
            return true
          },
        }),
        { config: this }, // Pass config instance to prevent circular await config.getInstance()dependencies
      )
    }

    // Update this._env cache with immutable proxy
    this._setEnv(env)

    return this._env
  }

  /**
   * Set the project name
   * @param name - The new project name
   * @param {Object} options - Options object
   * @param {boolean} options.save - Save the config after updating the project name
   * @param {boolean} options.updateEnv - Update the LLEMONSTACK_PROJECT_NAME environment variable
   */
  public async setProjectName(
    name: string,
    { save = true, updateEnv = true }: { save?: boolean; updateEnv?: boolean } = {},
  ): Promise<TryCatchResult<boolean>> {
    const envKey = 'LLEMONSTACK_PROJECT_NAME'
    if (updateEnv && this._env[envKey]) {
      this.setEnvKey(envKey, name)
    }
    this._config.projectName = name
    if (save) {
      return await this.save()
    }
    return success<boolean>(true)
  }

  /**
   * Check if a service is enabled
   *
   * Returns null if service is not found.
   *
   * @param serviceName - The service name
   * @returns True or false if service exists, otherwise null
   */
  public isEnabled(serviceName: string): boolean | null {
    return this.getServiceByName(serviceName)?.isEnabled() || null
  }

  public getAllServices(): ServicesMap {
    return this._services
  }

  public getEnabledServices(): ServicesMap {
    // TODO: add cache if this is called a lot
    return this._services.getEnabled()
  }

  /**
   * Get a service by service identifier
   *
   * @param {string} service - The service key in llemonstack.yaml, or service.id
   * @returns {Service | null} The service or null if not found
   */
  public getServiceByName(serviceName: string): Service | null {
    const serviceId = serviceName.includes('/')
      ? serviceName
      : this._servicesLookup.get(serviceName)
    return serviceId ? this._services.get(serviceId) || null : null
  }

  /**
   * Get a service by service identifier
   * @param {string} service - The service key in llemonstack.yaml, or service.id
   * @returns {Service | null} The service or null if not found
   */
  public getServicesByNames(serviceNames: string[]): ServicesMap {
    const services = new ServicesMap()
    serviceNames.forEach((serviceName) => {
      const service = this.getServiceByName(serviceName)
      if (service) {
        services.addService(service)
      } else {
        // TODO: log warning
      }
    })
    return services
  }

  public getServicesGroups(): IServicesGroups {
    return this._serviceGroups
  }

  /**
   * Get services compose yaml files
   *
   * Filter out disabled services unless all is true.
   *
   * @param {boolean} all - Include all services, even disabled ones
   * @returns {string[]}
   */
  public getComposeFiles({ all = false }: { all?: boolean } = {}): string[] {
    return Array.from(this._services.values())
      .map((service) => {
        return (!all && !service.isEnabled()) ? false : service.composeFile
      })
      .filter((value: string | false, index: number, self: (string | false)[]) =>
        value && self.indexOf(value) === index
      ) as string[]
  }

  /**
   * Update the enabled state of a service
   *
   * If enabled is 'auto', the service will be added to the auto enabled services map
   * and the service will be enabled if it has any enabled dependents.
   *
   * @param service - The service to update the enabled state of
   * @param {boolean | 'auto'} enabled - The new enabled state of the service
   */
  public updateServiceEnabledState(service: Service, enabled: boolean | 'auto') {
    if (enabled === 'auto') {
      // Add service to auto enabled services map
      this._autoEnabledServices.addService(service)
      // Check if service has any enabled dependents
      const enabledDependents = this.getServiceDependents(service)?.getEnabled()
      if (enabledDependents && enabledDependents.size > 0) {
        service.setState('enabled', true)
      } else {
        service.setState('enabled', false)
      }
    } else {
      service.setState('enabled', enabled)
      // Remove service from auto enabled services map
      this._autoEnabledServices.delete(service.id)
    }
  }

  /**
   * Save the project config to the config file
   * @returns {Promise<TryCatchResult<boolean>>}
   */
  public async save(): Promise<TryCatchResult<boolean>> {
    if (!fs.isInsideCwd(this.configFile)) {
      return new TryCatchResult<boolean, Error>({
        data: false,
        error: new Error(
          'Config directory is outside the current working directory, unsafe to proceed',
        ),
        success: false,
      })
    }

    // Update service enabled state and profiles in config before saving
    this.getAllServices().forEach((service) => {
      const enabled = service.isEnabled()
      const auto = this._autoEnabledServices.has(service.id)
      const serviceConfig = {
        enabled: auto ? 'auto' : enabled,
        profiles: service.getProfiles(),
      } as IServiceConfigState
      if (serviceConfig.profiles && serviceConfig.profiles.length === 0) {
        delete serviceConfig.profiles
      }
      this._config.services[service.service] = serviceConfig
    })

    return await fs.saveJson(this.configFile, this._config)
  }

  public isOutdatedConfig(): boolean {
    return this._config.version !== Config.llemonstackVersion
  }

  public setEnvKey(key: string, value: string) {
    const env = { ...this._env, [key]: value } // Clone _env object to remove immutability
    Deno.env.set(key, value)
    return this._setEnv(env)
  }

  /**
   * Prepare the env for the project and all enabled services
   *
   * @param {Object} options - Options object
   * @param {boolean=false} options.all - Prepare the env for all services, not just enabled ones
   * @returns {Promise<TryCatchResult<boolean>>}
   */
  public async prepareEnv(
    { all = false, silent = false }: { all?: boolean; silent?: boolean } = {},
  ): Promise<TryCatchResult<boolean>> {
    const results = success<boolean>(true)

    // Make sure required base dirs exist
    results.collect(
      await Promise.all(
        Object.values(this._config.dirs).map((dir) => {
          if (dir && typeof dir === 'string') {
            return fs.ensureDir(dir, { allowOutsideCwd: false })
          } else if (dir && Array.isArray(dir)) {
            return dir.map((d) => fs.ensureDir(d, { allowOutsideCwd: false }))
          }
          return success<boolean>(true)
        }).flat(),
      ),
    )

    if (!results.success) {
      results.addMessage('error', 'Failed to ensure required dirs exist')
    }

    // Create the docker network
    const networkResult = await prepareDockerNetwork(this.dockerNetworkName)
    if (!networkResult.success) {
      results.addMessage('error', 'Failed to prepare docker network')
    }

    const services = all ? this.getAllServices() : this.getEnabledServices()

    // TODO: log messages in services instead of collecting them
    // Services prep could take awhile, so it's better to log messages as they come in

    // Run all service prepareEnv methods in parallel
    results.collect(
      await Promise.all(
        services.map((service) => service.prepareEnv({ silent })),
      ),
    )

    // Return the results, results.success will be true if all services are ready
    return results
  }

  //
  // Private Methods
  //

  /**
   * Create an immutable proxy of the env object
   * @returns {Proxy<Record<string, string>>}
   */
  private _setEnv<T extends Record<string, string>>(obj: T): Record<string, string> {
    this._env = new Proxy(obj, {
      set(_target, property, _value) {
        throw new Error(
          `Cannot modify env: property '${String(property)}' cannot be set`,
        )
      },
      deleteProperty(_target, property) {
        throw new Error(
          `Cannot modify env: property '${String(property)}' cannot be deleted`,
        )
      },
    })
    return this._env
  }

  /**
   * Check if the project config is valid
   * @returns {boolean}
   */
  private isValidConfig(config: LLemonStackConfig = this._config): boolean {
    if (!config) {
      return false
    }

    // Check if all required top-level keys from the template exist in the project config
    const requiredKeys = [
      'initialized',
      'version',
      'projectName',
      'envFile',
      'dirs',
      'services',
    ] as const
    for (const key of requiredKeys) {
      if (!(key in config)) {
        return false
      }

      // For object properties, check if they have the expected structure
      const templateValue = this._configTemplate[key as keyof typeof this._configTemplate]
      const projectValue = config[key as keyof LLemonStackConfig]

      if (
        typeof templateValue === 'object' &&
        templateValue !== null &&
        !Array.isArray(templateValue)
      ) {
        // If the property is missing or not an object in the project config, it's invalid
        if (
          typeof projectValue !== 'object' ||
          projectValue === null
        ) {
          return false
        }

        // For nested objects like dirs, services, etc., check if all template keys exist
        const templateObj = templateValue as Record<string, unknown>
        const projectObj = projectValue as Record<string, unknown>

        for (const subKey of Object.keys(templateObj)) {
          if (!(subKey in projectObj)) {
            // Handle optional dirs.services key
            if (key === 'dirs' && subKey === 'services') {
              return true
            }
            return false
          }
        }
      }
    }
    return true
  }

  /**
   * Merge the template with the current project config to ensure all keys are present
   * @param template - The template to merge with the current project config
   */
  private updateConfig(template: LLemonStackConfig = this._configTemplate): LLemonStackConfig {
    if (!this._config) {
      this._config = { ...template }
      return this._config
    }

    const merged = deepMerge(
      template as unknown as Record<string, unknown>,
      { ...this._config } as unknown as Record<string, unknown>,
    ) as unknown as LLemonStackConfig

    // Set version to template version
    merged.version = template.version

    if (!merged.initialized) {
      merged.initialized = new Date().toISOString()
    }

    this._config = merged
    return this._config
  }
}

// Export a default instance
export const config = Config.getInstance()
