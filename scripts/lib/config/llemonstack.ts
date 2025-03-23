import * as path from 'jsr:@std/path'
import packageJson from '../../../package.json' with { type: 'json' }

export class LLemonStackConfig {
  readonly installDir: string
  readonly version: string = packageJson.version
  readonly configDirBase: string = '.llemonstack'

  constructor() {
    this.installDir = path.join(
      path.dirname(path.fromFileUrl(import.meta.url)),
      '../../',
    )
  }
}
