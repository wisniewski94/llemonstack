import { tryCatch, TryCatchResult } from '@/lib/try-catch.ts'
import { Service } from './service.ts'

/**
 * Map of Services
 *
 * Extends Map to provide additional functionality for filtering and returning data.
 */
export class ServicesMap extends Map<string, Service> {
  /**
   * Add a service to the services map
   *
   * Provides a consistent API for what key is used in ServicesMap.
   *
   * @param {Service} service - The service to add
   * @param {ServicesMap} servicesMap - The services map to add the service to
   * @param {boolean} force - Whether to force add the service even if it already exists
   * @returns {boolean} Whether the service was successfully added
   */
  public static addService(
    service: Service,
    servicesMap: ServicesMap,
    { force = false }: { force?: boolean } = {},
  ): boolean {
    if (!force && servicesMap.has(service.servicesMapKey)) {
      return false
    }
    servicesMap.set(service.servicesMapKey, service)
    return true
  }

  constructor(entries: Service[] | [string, Service][] | undefined = undefined) {
    if (Array.isArray(entries) && entries.length > 0) {
      super(entries.map((service) => {
        if (service instanceof Service) {
          return [service.id, service] as [string, Service]
        }
        return [service[0], service[1]] as [string, Service]
      }))
      return
    }
    super()
  }

  /**
   * Add a service to the this services map instance
   *
   * @param {Service} service - The service to add
   * @returns {ServicesMap} The services map
   */
  public addService(service: Service | null, { force = false }: { force?: boolean } = {}): boolean {
    if (!service) {
      return false
    }
    return ServicesMap.addService(service, this, { force })
  }

  public hasService(service: Service): boolean {
    return this.has(service.servicesMapKey)
  }

  /**
   * Get all services in this map as an array
   *
   * @returns {Service[]} - Array of services
   */
  public toArray(): Service[] {
    return Array.from(this.values())
  }

  /**
   * Get compose files for the services in this map
   *
   * Returns an array of compose files for the services in this map.
   * Defaults to only enabled services unless all is true.
   *
   * @param {boolean} all - Include all services, even disabled ones
   * @returns {string[]} - Array of compose files
   */
  public getComposeFiles(): string[] {
    return Array.from(this.values())
      .map((service) => service.composeFile)
  }

  /**
   * Get enabled services in this map
   *
   * @returns {ServicesMap} - A new ServicesMap instance with only enabled services
   */
  public getEnabled(): ServicesMap {
    return this.filter((service) => service.isEnabled())
  }

  /**
   * Filter and map services by a function
   *
   * If function returns false, the service is not included in the results.
   *
   * Useful for filtering, mapping, and converting to an Array to use in Promise.all.
   *
   * @param filter - The function to filter and map by
   * @returns An array of results
   */
  public filterMap<T>(filter: (service: Service) => T | false): T[] {
    const results: T[] = []
    this.forEach((service) => {
      const result = filter(service)
      if (result !== false) {
        results.push(result)
      }
    })
    return results
  }

  /**
   * Map a function over the services in this map to a TryCatchResult
   *
   * @example
   * ```ts
   * // Run prepareEnv for all services in parallel
   * const results = await Promise.all(services.tryCatchMap((service) => service.prepareEnv()))
   *
   * // Optionally collect the results into a single TryCatchResult
   * const collectedResults = TryCatchResult.collect<boolean>(results)
   * ```
   *
   * @param mapFunction - The function to map over the services
   * @returns A promise of the results
   */
  public tryCatchMap<T>(
    mapFunction: (service: Service) => Promise<T>,
  ): Promise<TryCatchResult<T, Error>>[] {
    return this.toArray().map((service) => tryCatch<T>(mapFunction(service)))
  }

  /**
   * Filter services by a function
   *
   * @param filter - The function to filter by
   * @returns A new Services instance with only the services that match the function
   */
  public filter(filter: (service: Service) => boolean): ServicesMap {
    return new ServicesMap([...this.entries()].filter(([_, service]) => filter(service)))
  }

  /**
   * Map services by a function
   *
   * @param mapFunction - The function to map by
   * @returns Array of results
   */
  public map<T>(mapFunction: (service: Service) => T): T[] {
    return this.toArray().map(mapFunction)
  }

  /**
   * Filter services by a method name or property of the Service instance
   *
   * @param methodName - The name of the method to filter by
   * @returns A new Services instance with only the services that match the method name
   */
  public filterBy<K extends keyof Service>(methodName: K): ServicesMap {
    return new ServicesMap(
      [...this.entries()].filter(([_, service]) => {
        const method = service[methodName]
        if (typeof method === 'function') {
          // deno-lint-ignore ban-types
          return (method as Function).call(service)
        }
        return service[methodName]
      }),
    )
  }

  /**
   * Get missing services from a list of service names
   *
   * @param {string[]} serviceNames - The list of service names to check
   * @returns {string[]} - The list of missing service names
   */
  public missingServices(serviceNames: string[]): string[] {
    return serviceNames.filter((serviceName) => !this.has(serviceName))
  }
}
