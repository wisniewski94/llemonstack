export class ServiceConfig {
  private _name: string
  private _dir: string
  private _enabled: boolean
  private _composeFile: string

  constructor(
    { name, dir, enabled, composeFile }: {
      name: string
      dir: string
      enabled: boolean
      composeFile: string
    },
  ) {
    this._name = name
    this._enabled = enabled
    this._dir = dir
    this._composeFile = path.join(this._dir, composeFile)
  }

  public async initialize(llemonstackConfig: LLemonStackConfig): Promise<void> {
    // this._dir = await getAbsoluteServiceDir(this._dir, { llemonstackConfig, name: this._name })
  }

  get composeFile(): string {
    return path.join(this._dir, this._composeFile)
  }

  isEnabled(): boolean {
    return this._enabled
  }
}
