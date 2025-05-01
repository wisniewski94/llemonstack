import { tryRunCommand } from '@/lib/command.ts'
import { getDockerNetworks, prepareDockerNetwork, removeDockerNetwork } from '@/lib/docker.ts'
import { loadEnv, updateEnv } from '@/lib/env.ts'
import * as fs from '@/lib/fs.ts'
import { failure, success, TryCatchResult } from '@/lib/try-catch.ts'
import { isTruthy } from '@/lib/utils/compare.ts'
import { LogLevel } from '@/relayer/logger.ts'
import { LLemonStackConfig } from '@/types'
import packageJson from '@packageJson' with { type: 'json' }
import configTemplate from '@templateConfig' with { type: 'json' }
import Host from './lib/host.ts'
import { isValidConfig } from './lib/valid.ts'

// Absolute path to root of install dir
const INSTALL_DIR = fs.path.join(
  fs.path.dirname(fs.path.fromFileUrl(import.meta.url)),
  '../../../',
)

/**
 * Config Base
 *
 * This class is used to load the config file and environment variables.
 * It is not intended to be used directly, but rather to be extended by the Config class.
 */
export class ConfigBase {
  //
  // Static Properties: Config.*
  //

  static readonly defaultProjectName: string = 'llemonstack'
  static readonly defaultConfigFilePath: string = '.llemonstack/config.json'
  static readonly llemonstackVersion: string = packageJson.version

  //
  // Instance Properties: this.*
  //

  protected _envPrepared: boolean = false

  protected _host: Host = Host.getInstance()

  public LOG_LEVEL: LogLevel = 'info'
  protected _configTemplate: LLemonStackConfig = configTemplate as LLemonStackConfig
  protected _config: LLemonStackConfig = this._configTemplate

  // Caches
  protected _env: Record<string, string> = {}
  protected _initializeResult: TryCatchResult<boolean, Error> | null = null

  // Base configuration
  protected _configDir: string = ''
  protected _configFile: string = ''

  readonly installDir = INSTALL_DIR

  protected constructor() {
    // Set the default config file path
    this.setConfigFile(ConfigBase.defaultConfigFilePath)
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
    return this._config.projectName || ConfigBase.defaultProjectName
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
    return this._config.version || ConfigBase.llemonstackVersion
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
    { logLevel = 'info', init = false }: {
      logLevel?: LogLevel // TODO: move logLevel to Relayer
      init?: boolean // If false, return error if config file is invalid
    } = {},
  ): Promise<TryCatchResult<boolean, Error>> {
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
    const isValidResult = this.isValidConfig()
    if (!isValidResult.success) {
      // Attempt to update config.json from template
      result.collect([await this.updateConfig()])

      if (!result.success) {
        return failure(`Error updating project config file: ${this.configFile}`, result, false)
      }

      result.addMessage('info', 'Successfully updated config.json')
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
   * Load services
   * @returns {Promise<TryCatchResult<Record<string, Service>>>}
   */
  // deno-lint-ignore require-await
  public async loadServices(): Promise<TryCatchResult<boolean>> {
    return success<boolean>(true)
  }

  /**
   * Leads env vars from .env file
   *
   * Override in subclass
   *
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

    return env
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

    return await fs.saveJson(this.configFile, this._config)
  }

  public isOutdatedConfig(): boolean {
    return this._config.version !== ConfigBase.llemonstackVersion
  }

  /**
   * Set an env var in the in memory env object and Deno.env
   */
  public setEnvKey(key: string, value: string): Record<string, string> {
    const env = { ...this._env, [key]: value } // Clone _env object to remove immutability
    Deno.env.set(key, value)
    return this._setEnv(env)
  }

  /**
   * Update the .env file with the given vars
   *
   * Also updates the in memory env object and Deno.env.
   * @param vars - The vars to set
   * @returns {Promise<TryCatchResult<boolean>>}
   */
  public async setEnvFileVars(vars: Record<string, string>): Promise<TryCatchResult<boolean>> {
    const env = { ...this._env, ...vars } // Clone _env object to remove immutability
    Object.entries(vars).forEach(([key, value]) => {
      Deno.env.set(key, value)
    })
    this._setEnv(env) // Update the in memory env object

    return await updateEnv(this.envFile, vars) // Update the .env file
  }

  /**
   * Prepare the env for the project and all enabled services
   *
   * @param {Object} options - Options object
   * @param {boolean=false} options.all - Prepare the env for all services, not just enabled ones
   * @returns {Promise<TryCatchResult<boolean>>}
   */
  public async prepareEnv(
    { force = false }: {
      force?: boolean
    } = {},
  ): Promise<TryCatchResult<boolean>> {
    const results = success<boolean>(true)

    // Return early if env is already prepared
    if (this._envPrepared && !force) {
      results.addMessage('debug', 'Env is already prepared, skipping')
      return results
    }

    // Immediately set _envPrepared to avoid race conditions
    this._envPrepared = true

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
      this._envPrepared = false
    }

    // Create the docker network
    const networkResult = await prepareDockerNetwork(this.dockerNetworkName)
    if (!networkResult.success && networkResult.data?.stderr.includes('already exists')) {
      results.addMessage('info', 'Docker network already exists, skipping')
    } else if (!networkResult.success) {
      results.addMessage('error', 'Failed to prepare docker network')
      this._envPrepared = false
    }

    // Return the results, results.success will be true if all services are ready
    return results
  }

  /**
   * Remove the docker network
   * @returns {Promise<TryCatchResult<boolean>>}
   */
  public async cleanupDockerNetwork(
    { silent = true }: { silent?: boolean } = {},
  ): Promise<TryCatchResult<boolean>> {
    const results = success<boolean>(true)
    // Remove all networks for project
    const networksResults = await getDockerNetworks({ name: this.dockerNetworkName, silent })
    if (networksResults.success && networksResults.data && networksResults.data.length > 0) {
      results.collect([await removeDockerNetwork(networksResults.data, { silent })])
    }
    this._envPrepared = false
    return results
  }

  /**
   * Get the number of commits the local LLemonStack repo is behind the remote repo
   * @returns {Promise<TryCatchResult<number>>}
   */
  public async getRemoteCommits(): Promise<TryCatchResult<number>> {
    const results = success<number>(0)
    const gitResults = await tryRunCommand('git rev-list --count HEAD..@{u}', {
      silent: true,
      cwd: this.installDir,
    })
    if (gitResults.success && gitResults.data) {
      results.data = parseInt(gitResults.toString())
    }
    return results
  }

  //
  // Private Methods
  //

  /**
   * Create an immutable proxy of the env object
   * @returns {Proxy<Record<string, string>>}
   */
  protected _setEnv<T extends Record<string, string>>(obj: T): Record<string, string> {
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
   * Check if the project config is valid, auto patch missing service keys
   * @returns {TryCatchResult<boolean>}
   */
  protected isValidConfig(
    config: LLemonStackConfig = this._config,
    template: LLemonStackConfig = this._configTemplate,
  ): TryCatchResult<boolean> {
    return isValidConfig(config, template)
  }

  /**
   * Attempt to update the current project config.json with the template
   * @param template - The template to merge with the current project config
   */
  protected async updateConfig(
    template: LLemonStackConfig = this._configTemplate,
  ): Promise<TryCatchResult<boolean>> {
    const result = success<boolean>(true)

    if (!this._config) {
      this._config = { ...template }
      result.addMessage('info', 'No config.json found, creating from template')
      return result
    }

    const addMissingKeys = (
      obj1: LLemonStackConfig | Record<string, unknown>,
      obj2: LLemonStackConfig | Record<string, unknown>,
      ref: string = '',
    ) => {
      const originalKeys = Object.keys(obj2 || {})
      const newKeys = Object.keys(obj1 || {}).filter((key) => !originalKeys.includes(key))
      if (newKeys.length > 0) {
        result.addMessage(
          'info',
          `Adding missing keys to config.json${ref ? ` [${ref}]` : ''}: ${newKeys.join(', ')}`,
        )
      }
      return {
        ...obj1,
        ...obj2,
      }
    }

    // Manually merge to avoid duplicating services profiles with a deep merge

    const merged = addMissingKeys(template, this._config) as LLemonStackConfig

    merged.dirs = addMissingKeys(
      template.dirs,
      this._config.dirs,
      'dirs',
    ) as LLemonStackConfig['dirs']

    // Update version to template version
    if (merged.version !== template.version) {
      merged.version = template.version
      result.addMessage('info', 'Updated config.json version')
    }

    // Update initialized date if needed
    if (!merged.initialized) {
      merged.initialized = new Date().toISOString()
      result.addMessage('info', 'Initialized config.json')
    }

    // Update services to include new services from template
    merged.services = addMissingKeys(
      template.services,
      this._config.services,
      'services',
    ) as LLemonStackConfig['services']

    // Make sure new config is valid before saving
    result.collect([this.isValidConfig(merged, template)])
    if (!result.success) {
      result.addMessage('error', 'Failed to auto update config.json, please manually update it')
      return result
    }

    // Update the config
    this._config = merged

    // Save the config
    result.collect([await this.save()])

    return result
  }
}
