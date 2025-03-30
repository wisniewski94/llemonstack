import { expandEnvVars } from '@/lib/docker.ts'
import { searchObjectPaths } from '@/lib/utils/search-object.ts'
import type { ExposeHost, ServiceType } from '@/types'

/**
 * Search the service config exposes sections and return the endpoints
 *
 * @param service - The service to search for
 * @param context - The context to search for
 * @param env - The environment variables to expand
 * @returns The endpoints for the service
 */
export function getEndpoints(
  service: ServiceType,
  context: string = 'host.*',
  env: Record<string, string> = {},
): ExposeHost[] {
  // Search the service config exposes sections
  const data = searchObjectPaths<ExposeHost>(service._config.exposes, context)

  // Map each host to an ExposeHost object with expanded env vars
  const endpoints = data.map((item) => {
    const host = {
      _key: item.key,
      name: item.data.name || (item.key.split('.').pop() ?? ''),
      url: typeof item.data === 'string' ? item.data : item.data.url,
      info: item.data.info,
    } as ExposeHost

    // Expand env vars in the url and info
    if (host.url?.includes('${')) {
      host.url = expandEnvVars(host.url, env)
    }
    if (host.info?.includes('${')) {
      host.info = expandEnvVars(host.info, env)
    }

    // Expand credentials from env vars
    if (item.data?.credentials) {
      host.credentials = {}
      Object.entries(item.data.credentials).forEach(([key, value]) => {
        host.credentials![key] = expandEnvVars(String(value), env)
      })
    }

    return host
  })

  return endpoints
}
