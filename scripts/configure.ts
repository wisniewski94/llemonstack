/**
 * Configure the services
 */
import { Config } from '@/core/config/config.ts'
import { CheckboxOption, Select } from '@cliffy/prompt'

function getServiceOption(
  serviceName: string,
  config: Config,
  dependencies: Record<string, string[]>,
): CheckboxOption<string> | null {
  const service = config.getServiceByName(serviceName)
  if (!service) {
    return null
  }
  const requiredByServices = service.provides.map((key) =>
    dependencies[key]?.map((s) => config.getServiceByName(s))
  ).flat().filter(Boolean)
  const required = requiredByServices.some((s) => s?.isEnabled())
  return {
    name: `${service.name} - ${service.description} ${
      requiredByServices.length > 0
        ? `\n    ... Required by ${requiredByServices.map((s) => s?.name || '').join(', ')}`
        : ''
    }`,
    value: service.servicesMapKey,
    checked: service.isEnabled() || required,
    disabled: required,
  }
}

export async function configure(
  config: Config, // An initialized config instance
): Promise<void> {
  const show = config.relayer.show
  const groups = config.getServicesGroups()

  show.warn('THIS IS WIP and does not yet save the selected services.')

  show.action(`Configuring services for ${config.projectName}...`)
  // TODO: loop through all config.env keys to get list of ENABLE_* env vars
  // Then set enabled for each service
  // The save config
  // Then comment out ENABLE_* env vars in .env

  const enabledServices = new Set<string>()
  const dependencies: Record<string, string[]> = {}

  // const hasDependencies = (serviceName: string) => {
  //   return dependencies[serviceName]?.length > 0
  // }

  // Build dependencies map for all services
  // TODO: move this to config.ts
  config.getAllServices().forEach((service) => {
    service.depends_on.forEach((dependency) => {
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

    const selection = await Select.prompt({
      message: `Select ${groupName} services to manage (or exit):`,
      options: [
        ...groupServices.map((serviceName: string) =>
          getServiceOption(serviceName, config, dependencies)
        )
          .filter(Boolean) as CheckboxOption<string>[],
        'Exit',
      ],
    })

    console.log('selection', selection)
    if (selection === 'Exit') {
      break
    }
    const service = config.getServiceByName(selection)
    if (service) {
      service.setState('enabled', true)
      await service.configure({ silent: false, config })
    }
  }

  // Configure each enabled service
  for (const [_, service] of config.getAllServices()) {
    if (service && typeof service.configure === 'function') {
      if (enabledServices.has(service.servicesMapKey)) {
        const result = await service.configure({ silent: false, config })
        if (!result.success) {
          show.error(`Failed to configure ${service.name}`)
          show.logMessages(result.messages)
        }
      } else {
        // console.log('disabling service', service.service)
        service.setState('enabled', false)
      }
    }
  }

  // Save the configuration
  const saveResult = await config.save()
  if (!saveResult.success) {
    show.warn(`Failed to save configuration: ${saveResult.error?.message}`)
  } else {
    show.info('Configuration saved successfully.')
  }
}
