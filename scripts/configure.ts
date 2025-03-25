#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Configure the services
 */
import { Checkbox, CheckboxOption } from '@cliffy/prompt'
import { Config } from './lib/config/config.ts'
import { showWarning } from './lib/logger.ts'
import { DEFAULT_PROJECT_NAME } from './start.ts' // Adjust the path as necessary

const config = Config.getInstance()
await config.initialize()

export async function configure(
  projectName: string,
  { skipStart = false }: { skipStart?: boolean } = {},
): Promise<void> {
  const groups = config.getServiceGroups()

  showWarning('THIS IS WIP and does not yet save the selected services.')

  // Prompt user for each group, starting with apps
  for (let i = groups.length - 1; i >= 0; i--) {
    const groupName = groups[i][0]
    const groupServices = groups[i][1]
    if (groupServices.length === 0) continue

    const _groupResult = await Checkbox.prompt({
      message: `Select ${groupName} services to enable:`,
      options: groupServices.map((serviceName) => {
        const service = config.getService(serviceName)
        if (!service) {
          return null
        }
        return {
          name: `${service.name} - ${service.description}`,
          value: service.service,
          checked: service.enabled,
        }
      }).filter(Boolean) as CheckboxOption<string>[],
    })
    // console.log('groupResult:', _groupResult)
  }

  // TODO: save the selected services to config
  showWarning('THIS IS WIP and does not yet save the selected services.')
}

// Run script if this file is executed directly
if (import.meta.main) {
  await configure(
    Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME,
    { skipStart: Deno.args.includes('--skip-start') },
  )
}
