/**
 * Configure the services
 */
import { Checkbox, CheckboxOption } from '@cliffy/prompt'
import { Config } from './lib/core/config/config.ts'
import { showAction, showError, showInfo, showLogMessages, showWarning } from './lib/logger.ts'
import { DEFAULT_PROJECT_NAME } from './start.ts' // Adjust the path as necessary

// async function migrateEnabledEnvVars(): Promise<void> {
//   // TODO: loop through all config.env keys to get list of ENABLE_* env vars
//   // Then set enabled for each service
//   // The save config
//   // Then comment out ENABLE_* env vars in .env
//   const enabledEnvVars = Object.entries(config.env).filter(([key]) => key.startsWith('ENABLE_'))
//   for (const [key, value] of enabledEnvVars) {
//     const service = config.getService(key.replace('ENABLE_', ''))
//     if (service) {
//       service.enabled = value === 'true'
//     }
//   }
// }

export async function configure(
  config: Config, // An initialized config instance
): Promise<void> {
  const groups = config.getServiceGroups()

  showWarning('THIS IS WIP and does not yet save the selected services.')

  showAction(`Configuring services for ${config.projectName}...`)
  // TODO: loop through all config.env keys to get list of ENABLE_* env vars
  // Then set enabled for each service
  // The save config
  // Then comment out ENABLE_* env vars in .env

  const enabledServices = new Set<string>()
  const dependencies: Record<string, string[]> = {}

  // Build dependencies map for all services
  // TODO: move this to config.ts
  config.getInstalledServices().forEach((service) => {
    service.dependencies.forEach((dependency) => {
      if (!dependencies[dependency]) {
        dependencies[dependency] = []
      }
      dependencies[dependency].push(service.service)
    })
  })

  // Prompt user for each group, starting with apps
  for (let i = groups.length - 1; i >= 0; i--) {
    const groupName = groups[i][0]
    const groupServices = groups[i][1]
    if (groupServices.length === 0) continue

    const groupResult = await Checkbox.prompt({
      message: `Select ${groupName} services to enable:`,
      options: groupServices.map((serviceName) => {
        const service = config.getService(serviceName)
        if (!service) {
          return null
        }
        const requiredByServices = service.provides.map((key) =>
          dependencies[key]?.map((s) => config.getService(s))
        ).flat().filter(Boolean)
        const required = requiredByServices.some((s) => s && enabledServices.has(s.service))
        return {
          name: `${service.name} - ${service.description} ${
            requiredByServices.length > 0
              ? `\n    ... Required by ${requiredByServices.map((s) => s?.name || '').join(', ')}`
              : ''
          }`,
          value: service.service,
          checked: service.enabled || required,
          disabled: required,
        }
      }).filter(Boolean) as CheckboxOption<string>[],
    })
    groupResult.forEach((serviceName) => {
      const service = config.getService(serviceName)
      if (service) {
        enabledServices.add(service.service)
        service.enabled = true
      }
    })
  }

  // Configure each enabled service
  for (const service of config.getInstalledServices()) {
    if (service && typeof service.configure === 'function') {
      if (enabledServices.has(service.service)) {
        const result = await service.configure({ silent: false, config })
        if (!result.success) {
          showError(`Failed to configure ${service.name}`)
          showLogMessages(result.messages)
        }
      } else {
        // console.log('disabling service', service.service)
        service.enabled(false)
      }
    }
  }

  // Save the configuration
  const saveResult = await config.save()
  if (!saveResult.success) {
    showWarning(`Failed to save configuration: ${saveResult.error?.message}`)
  } else {
    showInfo('Configuration saved successfully.')
  }
}
