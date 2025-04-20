import { Service, ServicesMap } from '@/core/services/mod.ts'
import { runCommand } from '@/lib/command.ts'
import { success, TryCatchResult } from '@/lib/try-catch.ts'
import { LogLevel } from '@/relayer/logger.ts'
import { Relayer } from '@/relayer/relayer.ts'
import { InterfaceRelayerInstance, IServiceConfigState, IServicesGroups } from '@/types'
import { ConfigBase } from './base.ts'
import { loadServices } from './lib/load.ts'

/**
 * Config
 *
 * The Config class is responsible for loading the project config and services.
 * It also provides an API for access the config and services settings.
 */
export class Config extends ConfigBase {
  //
  // Static Properties: Config.*
  //

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

  private _relayer: InstanceType<typeof Relayer> | null = null

  private _services: ServicesMap = new ServicesMap()

  // Caches
  private _servicesLookup: Map<string, string> = new Map() // Maps service.service to serve.id

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

  //
  // Public Properties
  //

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

  get show(): InterfaceRelayerInstance {
    return this.relayer.show
  }

  //
  // Public Methods
  //

  /**
   * Initialize the config
   *
   * It should be called at the start of any CLI script.
   * @returns {Promise<Config>}
   */
  override async initialize(
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

    return await super.initialize(configFile, { logLevel, init })
  }

  /**
   * Check if all prerequisites are installed
   */
  public async checkPrerequisites(): Promise<void> {
    // Commands will throw an error if the prerequisite is not installed
    try {
      await runCommand('docker --version', { silent: true })
      await runCommand('docker compose version', { silent: true })
      await runCommand('git --version', { silent: true })
    } catch (error) {
      this.show.error(
        error as Error,
      )
      this.show.fatal(
        'Prerequisites not met, please install the required dependencies and try again.',
      )
    }
    this.show.info('✔️ All prerequisites are installed')
  }

  /**
   * Load services from services directory
   * @returns {Promise<TryCatchResult<Record<string, Service>>>}
   */
  override async loadServices(): Promise<TryCatchResult<boolean>> {
    const result = success<boolean>(true)
    const loadResults = await loadServices(this, {
      config: this._config,
      servicesDirs: this.servicesDirs,
    })
    if (loadResults.success && loadResults.data) {
      loadResults.data.forEach((service) => {
        this.registerService(service)
      })

      // After all services are loaded, update the dependencies maps
      this.updateDependencies()
      this.updateAutoEnabledServices()
    }
    result.data = loadResults.success
    result.collect([loadResults])
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
  override async loadEnv(
    {
      envPath = this.envFile, // Set to null to skip loading the .env file
      reload = false,
      expand = true,
      skipServices = false,
    }: {
      envPath?: string | null
      reload?: boolean
      expand?: boolean
      skipServices?: boolean
    } = {},
  ): Promise<Record<string, string>> {
    // Load .env file
    const env = await super.loadEnv({ envPath, reload, expand })

    if (!skipServices) {
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
    }

    // Update this._env cache with immutable proxy
    this._setEnv(env)

    return this._env
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
   * Get a service by the service it provides
   * @param {string} provides - The service key in llemonstack.yaml, or service.id
   * @returns {Service | null} The service or null if not found
   */
  public getServiceByProvides(provides: string): Service | null {
    return this._providers.get(provides)?.[0] || null
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
  override async save(): Promise<TryCatchResult<boolean>> {
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

    return await super.save()
  }

  /**
   * Prepare the env for the project and all enabled services
   *
   * @param {Object} options - Options object
   * @param {boolean=false} options.all - Prepare the env for all services, not just enabled ones
   * @returns {Promise<TryCatchResult<boolean>>}
   */
  override async prepareEnv(
    { all = false, silent = false, force = false }: {
      all?: boolean
      silent?: boolean
      force?: boolean
    } = {},
  ): Promise<TryCatchResult<boolean>> {
    const results = success<boolean>(true)

    // Return early if env is already prepared
    if (this._envPrepared && !force) {
      return results
    }

    // Prepare the env for the project
    results.collect([await super.prepareEnv({ force })])

    // TODO: log messages in services instead of collecting them
    // Services prep could take awhile, so it's better to log messages as they come in

    // Prepare the env for all services in parallel
    const services = all ? this.getAllServices() : this.getEnabledServices()
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
  // See base.ts for methods
}

// Export a default instance
export const config = Config.getInstance()
