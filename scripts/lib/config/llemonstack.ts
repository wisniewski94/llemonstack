import packageJson from '../../../package.json' with { type: 'json' }
import * as fs from '../fs.ts'

export class LLemonStackConfig {
  readonly installDir: string
  readonly version: string = packageJson.version
  readonly configDirBase: string = '.llemonstack'

  constructor() {
    this.installDir = fs.path.join(
      fs.path.dirname(fs.path.fromFileUrl(import.meta.url)),
      '../../../',
    )
  }
}
