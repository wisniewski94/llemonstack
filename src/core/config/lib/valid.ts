import { failure, success } from '@/lib/try-catch.ts'
import { LLemonStackConfig, TryCatchResult } from '@/types'

/**
 * Check if the project config is valid
 * @returns {boolean}
 */
export function isValidConfig(
  config: LLemonStackConfig,
  template: LLemonStackConfig,
): TryCatchResult<boolean> {
  const result = success<boolean>(true)
  if (!config) {
    return failure<boolean, Error>('Config is undefined', result, false)
  }

  // Check if all required top-level keys from the template exist in the project config
  const requiredKeys = [
    'initialized',
    'version',
    'projectName',
    'envFile',
    'dirs',
    'services',
  ] as const

  for (const key of requiredKeys) {
    if (!(key in config)) {
      return failure<boolean>(`Config is missing required key: ${key}`, result, false)
    }

    // For object properties, check if they have the expected structure
    const templateValue = template[key as keyof typeof template]
    const projectValue = config[key as keyof LLemonStackConfig]

    if (
      typeof templateValue === 'object' &&
      templateValue !== null &&
      !Array.isArray(templateValue)
    ) {
      // If the property is missing or not an object in the project config, it's invalid
      if (
        typeof projectValue !== 'object' ||
        projectValue === null
      ) {
        return failure<boolean>(`Config is missing required key: ${key}`, result, false)
      }

      // For nested objects like dirs, services, etc., check if all template keys exist
      const templateObj = templateValue as Record<string, unknown>
      const projectObj = projectValue as Record<string, unknown>

      for (const subKey of Object.keys(templateObj)) {
        if (!(subKey in projectObj)) {
          // Handle optional dirs.services key
          if (key === 'dirs' && subKey === 'services') {
            return result
          }
          return failure<boolean>(`Config is missing required key: ${key}.${subKey}`, result, false)
        }
      }
    }
  }
  return result
}
