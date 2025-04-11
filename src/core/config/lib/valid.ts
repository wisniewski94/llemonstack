import { LLemonStackConfig } from '@/types'

/**
 * Check if the project config is valid
 * @returns {boolean}
 */
export function isValidConfig(config: LLemonStackConfig, template: LLemonStackConfig): boolean {
  if (!config) {
    return false
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
      return false
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
        return false
      }

      // For nested objects like dirs, services, etc., check if all template keys exist
      const templateObj = templateValue as Record<string, unknown>
      const projectObj = projectValue as Record<string, unknown>

      for (const subKey of Object.keys(templateObj)) {
        if (!(subKey in projectObj)) {
          // Handle optional dirs.services key
          if (key === 'dirs' && subKey === 'services') {
            return true
          }
          return false
        }
      }
    }
  }
  return true
}
