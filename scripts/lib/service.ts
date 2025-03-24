/**
 * Service class
 *
 * Services can provide a service.ts file to override the default behavior.
 * The service.ts file should export a Service class that extends the base Service class.
 */
import { Config } from './config/config.ts'

// Use decorators for logger, config, etc.
export class Service {
  // @Config()
  private readonly config: Config

  constructor(private readonly _config: Config) {
    this.config = _config
  }

  public init() {
    console.log('Initializing service')
  }

  public start() {
    console.log('Starting service')
  }

  public stop() {
    console.log('Stopping service')
  }

  public update() {
    console.log('Updating service')
  }

  public version() {
    console.log('Version of service')
  }

  public import() {
    console.log('Importing service')
  }

  public export() {
    console.log('Exporting service')
  }

  // public backup() {
  //   console.log('Backing up service')
  // }

  // public restore() {
  //   console.log('Restoring service')
  // }
}
