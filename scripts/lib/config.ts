import { deepMerge } from 'jsr:@std/collections/deep-merge'
import projectTemplate from '../../config/config.0.2.0.json' with { type: 'json' }
import packageJson from '../../package.json' with { type: 'json' }
import { loadEnv } from './env.ts'
import * as fs from './fs.ts'
import { Service } from './service.ts'
import { failure, success, TryCatchResult } from './try-catch.ts'
import { ProjectConfig, ServiceConfig } from './types.d.ts'

export class Config {
  private static instance: Config
  private _debug: boolean = false
  private _installDir: string
  private _llemonstackVersion: string = packageJson.version
  private _configDirBase: string = '.llemonstack'
  private _project: ProjectConfig = projectTemplate
  private _services: Record<string, Service> = {}
  private _serviceConfigFile: string = 'llemonstack.yaml'
  private _env: Record<string, string> = {}
  private _initializeResult: TryCatchResult<Config, Error> = new TryCatchResult<Config, Error>({
    data: this,
    error: new Error('Config not initialized'),
    success: false,
  })
  private _serviceGroups: [string, string[]][] = [['databases', []], ['middleware', []], [
    'apps',
    [],
  ]]

  // Base configuration
  readonly configDir: string
  readonly configFile: string
  readonly defaultProjectName: string = 'llemonstack'

  get DEBUG(): boolean {
    return this._debug
  }

  set DEBUG(value: boolean) {
    this._debug = value
  }

  get projectName(): string {
    return this._env.LLEMONSTACK_PROJECT_NAME || this._project.projectName ||
      this.defaultProjectName
  }

  get envFile(): string {
    return fs.path.resolve(Deno.cwd(), this._project.envFile)
  }

  get installDir(): string {
    return this._installDir
  }

  get dockerNetworkName(): string {
    return `${this.projectName}_network`
  }

  get repoDir(): string {
    return fs.path.resolve(Deno.cwd(), this._project.dirs.repos)
  }

  get servicesDir(): string {
    if (this._project.dirs.services) {
      return fs.path.resolve(Deno.cwd(), this._project.dirs.services)
    }
    return fs.path.join(this.installDir, 'services')
  }

  get importDir(): string {
    return fs.path.resolve(Deno.cwd(), this._project.dirs.import)
  }

  get sharedDir(): string {
    return fs.path.resolve(Deno.cwd(), this._project.dirs.shared)
  }

  get volumesDir(): string {
    return fs.path.resolve(Deno.cwd(), this._project.dirs.volumes)
  }

  get project(): ProjectConfig {
    return this._project
  }

  get projectInitialized(): boolean {
    return !!this._project.initialized.trim()
  }

  get env(): Record<string, string> {
    return this._env
  }

  // Returns the LLemonStack version for the current project
  get version(): string {
    return this._project.version || this._llemonstackVersion
  }

  get installVersion(): string {
    return this._llemonstackVersion
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

  private constructor() {
    this._installDir = fs.path.join(
      fs.path.dirname(fs.path.fromFileUrl(import.meta.url)),
      '../../',
    )
    this.configDir = fs.path.join(Deno.cwd(), this._configDirBase)
    this.configFile = fs.path.join(this.configDir, 'config.json')
    this.DEBUG = `${Deno.env.get('LLEMONSTACK_DEBUG')} ${Deno.env.get('DEBUG')}`.toLowerCase()
      .includes('true')
  }

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config()
    }
    return Config.instance
  }

  /**
   * Initialize the config
   *
   * It should be called at the start of any CLI script.
   * @returns {Promise<Config>}
   */
  public async initialize(): Promise<TryCatchResult<Config, Error>> {
    if (this._initializeResult.success) {
      return this._initializeResult
    }

    const result = new TryCatchResult<Config, Error>({ data: this, error: null, success: true })

    let updated = false // Track if the project config was updated and needs to be saved

    // Load project config file
    const readResult = await fs.readJson<ProjectConfig>(this.configFile)

    if (readResult.data) {
      this._project = readResult.data
    } else if (readResult.error instanceof Deno.errors.NotFound) {
      // File doesn't exist, populate with a template
      this._project = projectTemplate
      result.addMessage('info', 'Project config file not found, creating from template')
      updated = true
    } else {
      result.error = readResult.error
    }

    // Check if project config is valid
    if (!this.isValidProjectConfig()) {
      this.updateProjectConfig(projectTemplate)
      result.addMessage('info', 'Project config file is invalid, updating from template')
      updated = true
    }

    // Load .env file
    await this.loadEnv()

    // Update DEBUG flag from env vars if not already enabled
    if (!this.DEBUG) {
      this.DEBUG = `${this._env.LLEMONSTACK_DEBUG} ${this._env.DEBUG}`.toLowerCase()
        .includes('true')
    }

    // Load services from services Directory
    const servicesResult = await this.loadServices()
    result.messages.push(...servicesResult.messages)

    if (updated) {
      const saveResult = await this.saveConfig()
      if (!saveResult.success) {
        result.error = saveResult.error
        result.addMessage(
          'error',
          `Error saving project config from template: ${this.configFile}`,
          { error: saveResult.error },
        )
      }
    }

    result.addMessage('debug', 'INITIALIZED CONFIG: this log message should only appear once')

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
        this._serviceGroups.find((group) => group[0] === serviceConfig.service_group)?.[1].push(
          serviceConfig.service,
        )
      }

      // Create Service constructor options
      const serviceOptions = {
        config: serviceConfig,
        dir: fs.path.join(this.servicesDir, serviceConfig.service),
        // enabled: null, // Uncomment this once enabled services are loaded from config.json
        repoBaseDir: this.repoDir,
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
      envPath?: string
      reload?: boolean
      expand?: boolean
    } = {},
  ): Promise<Record<string, string>> {
    // Load .env file
    const env = await loadEnv({ envPath, reload, expand })

    // Allow services to modify the env vars as needed
    for (const service of Object.values(this._services)) {
      if (service.enabled) {
        service.loadEnv(env)
      }
    }

    // Update this._env cache with immutable proxy
    this.setEnv(env)

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
      this.updateEnv(envKey, name)
    }
    this._project.projectName = name
    if (save) {
      return await this.saveConfig()
    }
    return success<boolean>(true)
  }

  private updateEnv(key: string, value: string) {
    // Clone env object
    const env = { ...this._env }
    env[key] = value
    Deno.env.set(key, value)
    this._env = env
    return this._env
  }

  /**
   * Check if a service is enabled in project config
   * @param service - The service name
   * @returns True if the service is enabled, false otherwise
   */
  public isEnabled(service: string): boolean {
    return this.getService(service)?.enabled || false
  }

  public getServices(): Record<string, Service> {
    return this._services
  }

  public getAvailableServices(): Service[] {
    return Object.values(this._services)
  }

  public getEnabledServices(): Service[] {
    return this.getAvailableServices().filter((service) => this.isEnabled(service.service))
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
    return this.getAvailableServices().map(
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
    this.getAvailableServices().forEach((service) => {
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
  private async saveConfig(): Promise<TryCatchResult<boolean>> {
    if (!fs.isInsideCwd(this.configFile).data) {
      return new TryCatchResult<boolean, Error>({
        data: false,
        error: new Error(
          'Config directory is outside the current working directory, unsafe to proceed',
        ),
        success: false,
      })
    }
    return await fs.saveJson(this.configFile, this._project)
  }

  /**
   * Create an immutable proxy of the env object
   * @returns {Proxy<Record<string, string>>}
   */
  private setEnv<T extends Record<string, string>>(obj: T): Record<string, string> {
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
  private isValidProjectConfig(config: ProjectConfig = this._project): boolean {
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
      // 'services',
    ] as const
    for (const key of requiredKeys) {
      if (!(key in config)) {
        return false
      }

      // For object properties, check if they have the expected structure
      const templateValue = projectTemplate[key as keyof typeof projectTemplate]
      const projectValue = config[key as keyof ProjectConfig]

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
  private updateProjectConfig(template: ProjectConfig = projectTemplate): void {
    if (!this._project) {
      this._project = { ...template }
      return
    }

    const merged = deepMerge(
      template as unknown as Record<string, unknown>,
      { ...this._project } as unknown as Record<string, unknown>,
    ) as unknown as ProjectConfig

    // Set version to template version
    merged.version = template.version

    this._project = merged
  }
}

// Export a default instance
export const config = Config.getInstance()
