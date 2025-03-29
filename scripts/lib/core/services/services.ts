import { Service } from './service.ts'

/**
 * Map of Services
 *
 * Extends Map to provide additional functionality for filtering and returning data.
 */
export class Services extends Map<string, Service> {
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
   * @returns {Services} - A new Services instance with only enabled services
   */
  public getEnabled(): Services {
    return this.filter((service) => service.enabled())
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
  public filter(filter: (service: Service) => boolean): Services {
    return new Services([...this.entries()].filter(([_, service]) => filter(service)))
  }

  /**
   * Filter services by a method name or property of the Service instance
   *
   * @param methodName - The name of the method to filter by
   * @returns A new Services instance with only the services that match the method name
   */
  public filterBy<K extends keyof Service>(methodName: K): Services {
    return new Services(
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
}
