import { path } from '../fs.ts'
import { RepoService, ServiceConfig } from '../types.d.ts'

export class Service {
  public name: string // Human readable name
  public service: string // Service name
  public description: string // Service description

  private _dir: string
  private _config: ServiceConfig
  private _enabled: boolean = false
  private _composeFile: string
  private _repoDir: string | null = null

  constructor(
    { config, dir, enabled, repoBaseDir }: {
      config: ServiceConfig
      dir: string
      enabled?: boolean
      repoBaseDir: string
    },
  ) {
    this.name = config.name
    this.service = config.service
    this.description = config.description
    this._enabled = enabled ?? false
    this._config = config
    this._dir = dir
    this._composeFile = path.join(this._dir, config.compose_file)
    this._repoDir = config.repo?.dir ? path.join(repoBaseDir, config.repo?.dir) : null
  }

  get composeFile(): string {
    return this._composeFile
  }

  get enabled(): boolean {
    return this._enabled
  }

  set enabled(enabled: boolean) {
    this._enabled = enabled
  }

  get config(): ServiceConfig {
    return this._config
  }

  get repoConfig(): RepoService | null {
    return this._config.repo ?? null
  }

  get repoDir(): string | null {
    return this._repoDir
  }

  get customStart(): boolean {
    return this._config.custom_start ?? false
  }

  get serviceGroup(): string {
    return this._config.service_group ?? ''
  }

  get volumes(): string[] {
    return this._config.volumes ?? []
  }

  get volumesSeeds(): { source: string; destination: string; from_repo?: true }[] {
    return this._config.volumes_seeds ?? []
  }
}
