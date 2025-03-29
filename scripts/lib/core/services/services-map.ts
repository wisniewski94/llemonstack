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
    if (!force && servicesMap.has(service.id)) {
      return false
    }
    servicesMap.set(service.id, service)
    return true
  }

  /**
   * Add a service to the this services map instance
   *
   * @param {Service} service - The service to add
   * @returns {ServicesMap} The services map
   */
  public addService(service: Service, { force = false }: { force?: boolean } = {}): boolean {
    return ServicesMap.addService(service, this, { force })
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
   * Filter services by a function
   *
   * @param filter - The function to filter by
   * @returns A new Services instance with only the services that match the function
   */
  public filter(filter: (service: Service) => boolean): ServicesMap {
    return new ServicesMap([...this.entries()].filter(([_, service]) => filter(service)))
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
