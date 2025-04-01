/**
 * Example Service template for creating new services
 */
import { success } from '@/lib/try-catch.ts'
import { EnvVars, ExposeHost, IServiceActionOptions, TryCatchResult } from '@/types'
import { Service } from '../service.ts'

export class ServiceStub extends Service {
  /**
   * Get the enabled status of the service
   * @returns The enabled status of the service
   */
  override isEnabled(): boolean {
    // Example checking an env var to determine if the service should be enabled
    const envValue = this._configInstance.env['SOME_ENV_VAR'].trim().toLowerCase()
    return envValue === 'custom'
  }

  /**
   * Get the endpoints exposed by the service
   * @returns The host URL
   */
  override getEndpoints(_context: string): ExposeHost[] {
    // Example getting a custom host url from an env var
    const host =
      this._configInstance.env['SOME_SERVICE_HOST'] || (this.getProfiles()[0] === 'custom-host')
        ? 'http://host.docker.internal:1234'
        : 'http://service:1234'
    return [{ url: host }]
  }

  /**
   * Load environment variables for the service
   * @param envVars - The environment variables to load
   * @returns The environment variables
   */
  // deno-lint-ignore require-await
  override async loadEnv(envVars: Record<string, string>): Promise<Record<string, string>> {
    // Example setting a custom host url for other services or configs to use at runtime
    envVars.SOME_CUSTOM_SERVICE_ENV_HOST = this.getHostEndpoint()?.url
    return envVars
  }

  /**
   * Start the service
   * @param {EnvVars} [envVars] - Environment variables to pass to the service
   * @param {boolean} [silent] - Whether to run the command in silent mode
   * @returns {TryCatchResult<boolean>} - The result of the command
   */
  override async start(
    { envVars = {}, silent = false }: {
      envVars?: EnvVars
      silent?: boolean
    } = {},
  ): Promise<TryCatchResult<boolean>> {
    // Example skipping the start command if a custom host is used
    if (this.getProfiles().includes('custom-host')) {
      const results = success<boolean>(true)
      results.addMessage('info', `Skipping ${this.name} start, using host bridge`)
      return results
    }
    return await super.start({ envVars, silent })
  }

  /**
   * Configure the service
   * @param {boolean} [silent] - Whether to run the configuration in silent or interactive mode
   * @returns {TryCatchResult<boolean>} - The result of the configuration
   */
  override async configure(
    { config, silent = false }: IServiceActionOptions,
  ): Promise<TryCatchResult<boolean>> {
    const gpuDisabled = this._configInstance.host.isMac()

    // TODO: show example with prompts, cli output, etc.
    // TODO: pass a logger instance to the configure method
    // Maybe call the IO logger object: Relayer - it's the IO & logging layer

    return super.configure({ config, silent })
  }
}

export default ServiceStub
