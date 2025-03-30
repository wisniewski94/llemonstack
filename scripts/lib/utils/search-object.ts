/**
 * Utility functions to search through an object using a dot-notation path pattern
 *
 * ```typescript
 * // Example usage:
 * const testObj = {
 *   hosts: [
 *     { name: 'dashboard', url: 'http://dashboard.example.com' },
 *     { name: 'api', url: 'http://api.example.com' },
 *   ],
 *   internal: {
 *     key1: { url: 'http://internal.example.com' },
 *   },
 * }
 *
 * // Find all host objects
 * const hostObjects = searchObjectPaths(testObj, 'hosts.*')
 * console.log('Host objects:', hostObjects)
 * // [
 * //   { key: 'hosts.0', data: {name: "dashboard", url: 'http://dashboard.example.com'} },
 * //   { key: 'hosts.1', data: {name: "api", url: "http://api.example.com"} }
 * // ]
 *
 * // Find all URLs
 * const allUrls = searchObjectPaths<string>(testObj, '*.*.url')
 * console.log('All URLs:', allUrls)
 * // [
 * //   { key: 'hosts.0.url', data: 'http://dashboard.example.com' },
 * //   { key: 'hosts.1.url', data: 'http://api.example.com' },
 * //   { key: 'internal.key1.url', data: 'http://internal.example.com' }
 * // ]
 *
 * // Find internal URL
 * const internalUrl = searchObjectPaths<string>(testObj, 'internal.*.url')
 * console.log('Internal URL:', internalUrl)
 * // [{ key: 'internal.key1.url', data: 'http://internal.example.com' }]
 * ```
 */

/**
 * Result interface for object path search
 */
interface PathSearchResult<T = unknown> {
  key: string
  data: T
}

/**
 * Searches through an object using a dot-notation path pattern
 * Supports wildcard (*) to match any property or array index at a specific level
 *
 * @param obj The object to search through
 * @param pattern The dot-notation path pattern (e.g., "hosts.*" or "internal.*.url")
 * @returns Array of objects with matched key and data
 */
export function searchObjectPaths<T = unknown>(
  obj: unknown,
  pattern: string,
): PathSearchResult<T>[] {
  // Split the pattern into segments
  const segments = pattern.split('.')

  // Start with the root object and empty path
  return searchLevel(obj, segments, 0, [])
}

/**
 * Recursively search through an object level by level
 *
 * @param current The current object or value being evaluated
 * @param segments Array of path segments to match
 * @param depth Current depth in the path
 * @param currentPath Array of keys representing the current path
 * @returns Array of objects with matched key and data
 */
function searchLevel<T>(
  current: unknown,
  segments: string[],
  depth: number,
  currentPath: string[],
): PathSearchResult<T>[] {
  // Base case: if we've reached the end of our segments, return the current value with its path
  if (depth >= segments.length) {
    const key = currentPath.join('.')
    return [{ key, data: current as T }]
  }

  const segment = segments[depth]
  const results: PathSearchResult<T>[] = []

  // Wildcard segment - iterate through all properties or array indices
  if (segment === '*') {
    if (Array.isArray(current)) {
      // If current is an array, search each element with its index
      for (let i = 0; i < current.length; i++) {
        const newPath = [...currentPath, i.toString()]
        results.push(...searchLevel<T>(current[i], segments, depth + 1, newPath))
      }
    } else if (current && typeof current === 'object') {
      // If current is an object, search each property
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          const newPath = [...currentPath, key]
          results.push(
            ...searchLevel<T>(
              (current as Record<string, unknown>)[key],
              segments,
              depth + 1,
              newPath,
            ),
          )
        }
      }
    }
  } // Exact property match
  else if (
    current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, segment)
  ) {
    const newPath = [...currentPath, segment]
    results.push(
      ...searchLevel<T>(
        (current as Record<string, unknown>)[segment],
        segments,
        depth + 1,
        newPath,
      ),
    )
  }

  return results
}
