import projectTemplate from '../../config/config.0.2.0.json' with { type: 'json' }
import { LLemonStackConfig } from './config/llemonstack.ts'
import { ServiceConfig } from './config/service.ts'
import * as fs from './fs.ts'
import { failure, TryCatchResult } from './try-catch.ts'
import { ProjectConfig } from './types.d.ts'

export class Config {
  private static instance: Config
  private _llemonstack: LLemonStackConfig
  private _project: ProjectConfig = projectTemplate
  private _services: Record<string, ServiceConfig> = {}
  private _initialized: boolean = false

  // Base configuration
  readonly configDir: string
  readonly configFile: string
  readonly DEBUG: boolean = Deno.env.get('LLEMONSTACK_DEBUG')?.toLowerCase() === 'true'

  get repoDir(): string {
    return fs.path.join(this.configDir, 'repos')
  }

  get servicesDir(): string {
    return fs.path.join(this.configDir, 'services')
  }

  get importDir(): string {
    return fs.path.join(Deno.cwd(), 'import')
  }

  get sharedDir(): string {
    return fs.path.join(Deno.cwd(), 'shared')
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

    // Load project config file
    const readResult = await fs.readJson<ProjectConfig>(this.configFile)
    if (readResult.data) {
      this._project = readResult.data
    } else if (readResult.error instanceof Deno.errors.NotFound) {
      // File doesn't exist, populate with a template
      this._project = projectTemplate
      const saveResult = await this.save()
      if (!saveResult.success) {
        result.error = saveResult.error
        return failure('Error saving project config from template', result)
      }
    } else {
      result.error = readResult.error
      return failure(`Error loading project config file`, result)
    }

    this._initialized = true
    return result
  }

  /**
   * Save the project config to the config file
   * @returns {Promise<TryCatchResult<boolean>>}
   */
  private async save(): Promise<TryCatchResult<boolean>> {
    return await fs.saveJson(this.configFile, this._project)
  }
}

// Export a default instance
export const config = Config.getInstance()
