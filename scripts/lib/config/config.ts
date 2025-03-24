import { deepMerge } from 'jsr:@std/collections/deep-merge'
import projectTemplate from '../../../config/config.0.2.0.json' with { type: 'json' }
import { loadEnv } from '../env.ts'
import * as fs from '../fs.ts'
import { failure, TryCatchResult } from '../try-catch.ts'
import { OllamaProfile, ProjectConfig } from '../types.d.ts'
import { LLemonStackConfig } from './llemonstack.ts'
import { ServiceConfig } from './service.ts'

export class Config {
  private static instance: Config
  private _llemonstack: LLemonStackConfig
  private _project: ProjectConfig = projectTemplate
  private _services: Record<string, ServiceConfig> = {}
  private _initialized: boolean = false
  private _env: Record<string, string> = {}

  // Base configuration
  readonly configDir: string
  readonly configFile: string

  get DEBUG(): boolean {
    return Deno.env.get('LLEMONSTACK_DEBUG')?.toLowerCase() === 'true'
  }

  get projectName(): string {
    return this._env.LLEMONSTACK_PROJECT_NAME || this._project.projectName
  }

  get envFile(): string {
    return fs.path.resolve(Deno.cwd(), this._project.envFile)
  }

  get installDir(): string {
    return this._llemonstack.installDir
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
    return fs.path.join(this._llemonstack.installDir, 'services')
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

  private constructor() {
    this._llemonstack = new LLemonStackConfig()
    this.configDir = fs.path.join(Deno.cwd(), this._llemonstack.configDirBase)
    this.configFile = fs.path.join(this.configDir, 'config.json')
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
    const result = new TryCatchResult<Config, Error>({ data: this, error: null, success: true })

    if (this._initialized) {
      return result
    }

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

    if (!this.isValidProjectConfig()) {
      this.updateProjectConfig(projectTemplate)
      result.addMessage('info', 'Project config file is invalid, updating from template')
      updated = true
    }

    if (updated) {
      const saveResult = await this.save()
      if (!saveResult.success) {
        result.error = saveResult.error
        result.addMessage('error', 'Error saving project config from template', saveResult.error)
      }
    }

    // Load .env file
    const env = await loadEnv({ envPath: this.envFile })
    // Set OLLAMA_HOST
    // TODO: remove this once scripts are migrated to use Config
    this._env.OLLAMA_HOST = this.getOllamaHost()
    Deno.env.set('OLLAMA_HOST', this._env.OLLAMA_HOST)
    this.setEnv(env)

    if (!result.success) {
      return failure(`Error loading project config file: ${this.configFile}`, result)
    }

    this._initialized = true
    return result
  }

  // HACK: need a better way of handling Ollama profiles and host settings
  public getOllamaProfile(): OllamaProfile {
    return `ollama-${Deno.env.get('ENABLE_OLLAMA')?.trim() || 'false'}` as OllamaProfile
  }

  // HACK: need a better way of handling Ollama profiles and host settings
  public getOllamaHost(): string {
    // Use the OLLAMA_HOST env var if it is set, otherwise check Ollama profile settings
    const host = Deno.env.get('OLLAMA_HOST') || (this.getOllamaProfile() === 'ollama-host')
      ? 'host.docker.internal:11434'
      : 'ollama:11434'
    return host
  }

  /**
   * Save the project config to the config file
   * @returns {Promise<TryCatchResult<boolean>>}
   */
  private async save(): Promise<TryCatchResult<boolean>> {
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
