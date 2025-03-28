import { deepMerge } from 'jsr:@std/collections/deep-merge'
import configTemplate from '../../config/config.0.2.0.json' with { type: 'json' }
import packageJson from '../../package.json' with { type: 'json' }
import { loadEnv } from './env.ts'
import * as fs from './fs.ts'
import { Service } from './service.ts'
import { failure, success, TryCatchResult } from './try-catch.ts'
import { LLemonStackConfig, ServiceConfig } from './types.d.ts'
import { isTruthy } from './utils.ts'

export class Config {
  // Static properties: Config.*
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

  // Instance properties: this.*
  protected _debug: boolean = false
  private _configTemplate: LLemonStackConfig = configTemplate as LLemonStackConfig
  private _config: LLemonStackConfig = this._configTemplate
  private _services: Record<string, Service> = {}
  private _serviceConfigFile: string = 'llemonstack.yaml'
  private _env: Record<string, string> = {}
  private _initializeResult: TryCatchResult<Config, Error> = new TryCatchResult<Config, Error>({
    data: this,
    error: new Error('Config not initialized'),
    success: false,
  })

  private _serviceGroups: [string, string[]][] = [
    ['databases', []],
    ['middleware', []],
    ['apps', []],
  ]

  // Base configuration
  protected _configDir: string = ''
  protected _configFile: string = ''

  readonly installDir = fs.path.join(
    fs.path.dirname(fs.path.fromFileUrl(import.meta.url)),
    '../../',
  )

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
    return this._debug
  }

  set DEBUG(value: boolean) {
    this._debug = value
  }

  /**
   * Get the project name from config.json, env, or default
   * @returns {string}
   */
  get projectName(): string {
    return this._config.projectName || this.env.LLEMONSTACK_PROJECT_NAME ||
      Config.defaultProjectName
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

  get repoDir(): string {
    return fs.path.resolve(Deno.cwd(), this._config.dirs.repos)
  }

  get servicesDir(): string {
    if (this._config.dirs.services) {
      return fs.path.resolve(Deno.cwd(), this._config.dirs.services)
    }
    return fs.path.join(this.installDir, 'services')
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

  // Check if config.json has been initialized by init script
  get projectInitialized(): boolean {
    return !!this._config.initialized.trim()
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
  get os(): string {
    switch (Deno.build.os) {
      case 'darwin':
        return 'macOS'
      case 'windows':
        return 'Windows'
      case 'linux':
        return 'Linux'
      default:
        return 'other'
    }
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
  public async initialize(
    configFile?: string,
    { debug, init = false }: {
      debug?: boolean
      init?: boolean // If false, return error if config file is invalid
    } = {},
  ): Promise<TryCatchResult<Config, Error>> {
    if (debug) {
      // Only update if debug was explicitly set to true
      this.DEBUG = debug
    }

    if (this._initializeResult.success) {
      return this._initializeResult
    }

    // Create a result object to add messages to
    const result = new TryCatchResult<Config, Error>({ data: this, error: null, success: true })

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
        return failure(`Config file not found: ${this.configFile}`, result)
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
        return failure(`Project config file is invalid: ${this.configFile}`, result)
      }
      this.updateConfig(this._configTemplate)
      result.addMessage('info', 'Project config file is invalid, updating from template')
      updated = true
    }

    // Load .env file
    await this.loadEnv()

    // Update DEBUG flag from env vars if not already enabled
    if (!this.DEBUG) {
      if (isTruthy(this.env.LLEMONSTACK_DEBUG)) {
        this.DEBUG = true
        result.addMessage('debug', 'DEBUG enabled in LLEMONSTACK_DEBUG env var')
      } else if (isTruthy(this.env.DEBUG)) {
        this.DEBUG = true
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
    const servicesResult = await this.loadServices()
    result.messages.push(...servicesResult.messages)

    // Load enabled services env, skipping .env file
    await this.loadEnv({ envPath: null })

    if (updated) {
      const saveResult = await this.save()
      if (!saveResult.success) {
        result.error = saveResult.error
        result.addMessage(
          'error',
          `Error saving project config from template: ${this.configFile}`,
          { error: saveResult.error },
        )
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

    // Get list of services in services directory
    const servicesDirResult = await fs.readDir(this.servicesDir)
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
      const yamlFilePath = fs.path.join(this.servicesDir, serviceDir.name, this._serviceConfigFile)
      if (!(await fs.fileExists(yamlFilePath)).data) {
        result.addMessage('debug', `Service config file not found: ${serviceDir.name}`)
        continue
      }
      const yamlResult = await fs.readYaml<ServiceConfig>(
        yamlFilePath,
      )
      if (!yamlResult.success || !yamlResult.data) {
        result.addMessage('error', `Error reading service config file: ${serviceDir.name}`, {
          error: yamlResult.error,
        })
        continue
      }

      const serviceConfig = yamlResult.data

      if (serviceConfig.disabled) {
        result.addMessage('debug', `Service ${serviceConfig.service} is disabled, skipping`)
        continue
      } else {
        result.addMessage(
          'debug',
          `${serviceConfig.name} service config successfully loaded into ${serviceConfig.service_group} group`,
        )
      }

      // Add service to service group
      if (!this._serviceGroups.find((group) => group[0] === serviceConfig.service_group)) {
        this._serviceGroups.push([serviceConfig.service_group, [serviceConfig.service]])
      } else {
        const group = this._serviceGroups.find((group) => group[0] === serviceConfig.service_group)
          ?.[1]
        if (group && !group.includes(serviceConfig.service)) {
          group.push(serviceConfig.service)
        }
      }
      // Create Service constructor options
      const serviceOptions = {
        config: serviceConfig,
        dir: fs.path.join(this.servicesDir, serviceConfig.service),
        repoBaseDir: this.repoDir,
        llemonstackConfig: this._config,
      }

      // Check if there's a custom service implementation in the service directory
      const serviceImplPath = fs.path.join(this.servicesDir, serviceDir.name, 'service.ts')
      const serviceImplExists = (await fs.fileExists(serviceImplPath)).data

      if (serviceImplExists) {
        try {
          // Dynamically import the service implementation
          const serviceModule = await import(`file://${serviceImplPath}`)
          const ServiceClass = Object.values(serviceModule)[0] as typeof Service

          if (ServiceClass && typeof ServiceClass === 'function') {
            this._services[serviceConfig.service] = new ServiceClass(serviceOptions)

            result.addMessage(
              'debug',
              `Using custom service implementation for ${serviceConfig.service}`,
            )
            continue // Skip the default Service instantiation below
          }
        } catch (error) {
          result.addMessage(
            'error',
            `Error loading custom service implementation for ${serviceConfig.service}`,
            {
              error,
            },
          )
        }
      }

      // Load the default Service class if no custom implementation exists
      this._services[serviceConfig.service] = new Service(serviceOptions)
    }

    return result
  }

  public async loadEnv(
    { envPath = this.envFile, reload = false, expand = true }: {
      envPath?: string | null
      reload?: boolean
      expand?: boolean
    } = {},
  ): Promise<Record<string, string>> {
    // Load .env file or use a clone of the current env vars
    const env = (!envPath) ? { ...this._env } : await loadEnv({ envPath, reload, expand })

    // Populate project name from config for services & docker to use
    env.LLEMONSTACK_PROJECT_NAME = this.projectName

    // Allow services to modify the env vars as needed
    for (const service of this.getEnabledServices()) {
      // Use a proxy to intercept env var changes and update Deno.env
      await service.loadEnv(
        new Proxy(env, {
          set: (target, prop, value) => {
            target[prop as string] = value
            Deno.env.set(prop as string, value)
            return true
          },
        }),
        this, // Pass config instance to prevent circular await config.getInstance()dependencies
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
   * Check if a service is enabled in project config
   * @param service - The service name
   * @returns True if the service is enabled, false otherwise
   */
  public isEnabled(service: string): boolean {
    return this.getService(service)?.enabled() || false
  }

  public getServices(): Record<string, Service> {
    return this._services
  }

  public getInstalledServices(): Service[] {
    return Object.values(this._services)
  }

  public getEnabledServices(): Service[] {
    return this.getInstalledServices().filter((service) => this.isEnabled(service.service))
  }

  public getService(service: string): Service | null {
    return this._services[service] || null
  }

  public getServiceGroups(): [string, string[]][] {
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
    return this.getInstalledServices().map(
      (service) => {
        return (!all && !this.isEnabled(service.service)) ? false : service.composeFile
      },
    )
      .filter((value, index, self) => value && self.indexOf(value) === index) as string[]
  }

  public getComposeFile(service: string): string | null {
    return this.getService(service)?.composeFile || null
  }

  public getServicesWithRepos(): Service[] {
    return Object.values(this._services).map((service) => {
      return (service.repoConfig) ? service : false
    }).filter(Boolean) as Service[]
  }

  public getServicesWithRequiredVolumes(): Service[] {
    const services: Service[] = []
    this.getInstalledServices().forEach((service) => {
      if (
        (service.volumes.length > 0 || service.volumesSeeds.length > 0) &&
        this.isEnabled(service.service)
      ) {
        services.push(service)
      }
    })
    return services
  }

  /**
   * Save the project config to the config file
   * @returns {Promise<TryCatchResult<boolean>>}
   */
  public async save(): Promise<TryCatchResult<boolean>> {
    if (!fs.isInsideCwd(this.configFile).data) {
      return new TryCatchResult<boolean, Error>({
        data: false,
        error: new Error(
          'Config directory is outside the current working directory, unsafe to proceed',
        ),
        success: false,
      })
    }
    // Update service enabled state and profiles in config before saving
    this.getInstalledServices().forEach((service) => {
      this._config.services[service.service] = {
        enabled: service.enabled(),
        profiles: service.getProfiles(),
      }
    })
    return await fs.saveJson(this.configFile, this._config)
  }

  public isOutdatedConfig(): boolean {
    return this._config.version !== Config.llemonstackVersion
  }

  public setEnvKey(key: string, value: string) {
    const env = { ...this._env } // Clone the env object to remove immutability
    env[key] = value
    Deno.env.set(key, value)
    this._env = env
    return this._env
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
  private updateConfig(template: LLemonStackConfig = this._configTemplate): void {
    if (!this._config) {
      this._config = { ...template }
      return
    }

    const merged = deepMerge(
      template as unknown as Record<string, unknown>,
      { ...this._config } as unknown as Record<string, unknown>,
    ) as unknown as LLemonStackConfig

    // Set version to template version
    merged.version = template.version

    this._config = merged
  }
}

// Export a default instance
export const config = Config.getInstance()
