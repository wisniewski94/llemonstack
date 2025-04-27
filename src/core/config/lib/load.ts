import { Service } from '@/core/services/service.ts'
import { fileExists, path, readDir, readYaml } from '@/lib/fs.ts'
import { failure, success, TryCatchResult } from '@/lib/try-catch.ts'
import { IServiceOptions, LLemonStackConfig, ServiceYaml } from '@/types'
import { Config } from '../config.ts'

const SERVICE_CONFIG_FILE_NAME = 'llemonstack.yaml'

/**
 * Load services from services directory
 * @returns {Promise<TryCatchResult<Record<string, Service>>>}
 */
export async function loadServices(
  config: Config,
  { config: _config, servicesDirs: _servicesDirs }: {
    config: LLemonStackConfig
    servicesDirs: string[]
  },
): Promise<TryCatchResult<Service[]>> {
  const result = success<Service[]>([])
  result.data = []

  // Load services from services directory in reverse order of priority
  // Higher priority services will override lower priority services
  const servicesDirs = [..._servicesDirs].reverse()

  // TODO: refactor into helper functions, run in parallel
  for (const servicesDir of servicesDirs) {
    // Get list of services in services directory
    const servicesDirResult = await readDir(servicesDir)
    if (servicesDirResult.error || !servicesDirResult.data) {
      return failure<Service[]>(
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
      // Skip directories that start with an underscore
      if (serviceDir.name.startsWith('_')) {
        continue
      }
      const yamlFilePath = path.join(servicesDir, serviceDir.name, SERVICE_CONFIG_FILE_NAME)
      if (!(await fileExists(yamlFilePath)).data) {
        result.addMessage('debug', `Service config file not found: ${serviceDir.name}`)
        continue
      }
      const yamlResult = await readYaml<ServiceYaml>(
        yamlFilePath,
      )
      if (!yamlResult.success || !yamlResult.data) {
        result.addMessage('error', `Error reading service config file: ${serviceDir.name}`, {
          error: yamlResult.error,
        })
        continue
      }

      const serviceYaml = yamlResult.data

      if (serviceYaml.disabled) {
        result.addMessage('debug', `Service ${serviceYaml.service} is disabled, skipping`)
        continue
      } else {
        result.addMessage(
          'debug',
          `${serviceYaml.name} loaded into ${serviceYaml.service_group} group`,
        )
      }

      const serviceConfig = _config.services[serviceYaml.service] || {}

      // Create Service constructor options
      const serviceOptions: IServiceOptions = {
        serviceYaml,
        serviceDir: path.join(servicesDir, serviceYaml.service),
        config,
        configSettings: serviceConfig,
        enabled: serviceConfig.enabled !== false, // Enable service unless explicitly disabled
      }

      // Check if there's a custom service implementation in the service directory
      const serviceImplPath = path.join(servicesDir, serviceDir.name, 'service.ts')
      const serviceImplExists = (await fileExists(serviceImplPath)).data

      if (serviceImplExists) {
        try {
          // Dynamically import the service implementation
          const serviceModule = await import(`file://${serviceImplPath}`)
          const ServiceClass = Object.values(serviceModule)[0] as typeof Service

          if (ServiceClass && typeof ServiceClass === 'function') {
            const service = new ServiceClass(serviceOptions)
            result.data.push(service)

            result.addMessage(
              'debug',
              `Using custom service implementation for ${serviceYaml.service}`,
            )
            continue // Skip the default Service instantiation below
          }
        } catch (error) {
          result.addMessage(
            'error',
            `Error loading custom service implementation for ${serviceYaml.service}`,
            {
              error,
            },
          )
        }
      }

      // Load the default Service class if no custom implementation exists
      const service = new Service(serviceOptions)
      result.data.push(service)
    }
  }

  return result
}
