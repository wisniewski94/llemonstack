#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Configure the services
 */
import { Checkbox, CheckboxOption } from '@cliffy/prompt'
import { Config } from './lib/config.ts'
import { showWarning } from './lib/logger.ts'
import { DEFAULT_PROJECT_NAME } from './start.ts' // Adjust the path as necessary

const config = Config.getInstance()
await config.initialize()

export async function configure(
  projectName: string,
): Promise<void> {
  const groups = config.getServiceGroups()

  showWarning('THIS IS WIP and does not yet save the selected services.')

  // TODO: loop through all config.env keys to get list of ENABLE_* env vars
  // Then set enabled for each service
  // The save config
  // Then comment out ENABLE_* env vars in .env

  const dependencies = new Set<string>()

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
        const required = service.provides.some((key) => dependencies.has(key))
        return {
          name: `${service.name} - ${service.description} ${
            required ? '[required by another service]' : ''
          }`,
          value: service.service,
          checked: service.enabled || required,
          disabled: required,
        }
      }).filter(Boolean) as CheckboxOption<string>[],
    })
    console.log('groupResult:', groupResult)
    groupResult.forEach((service) => {
      config.getService(service)?.dependencies.forEach((dependency) => {
        dependencies.add(dependency)
      })
    })
    console.log('dependencies:', dependencies)
  }

  // TODO: save the selected services to config
  showWarning('THIS IS WIP and does not yet save the selected services.')
}

// Run script if this file is executed directly
if (import.meta.main) {
  await configure(
    Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME,
  )
}
