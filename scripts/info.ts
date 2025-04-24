/**
 * Configure the services
 */
import { Config } from '@/core/config/config.ts'
import { colors } from '@cliffy/ansi/colors'

// deno-lint-ignore require-await
export async function info(
  config: Config, // An initialized config instance
): Promise<void> {
  const show = config.relayer.show

  show.action(`Info for ${config.projectName} project`)

  show.info('\nEnabled services:')
  config.getServicesGroups().forEach((groupServices, groupName) => {
    show.info(`${colors.brightBlue(groupName)}:`)
    groupServices.getEnabled().forEach((service) => {
      const profiles = service.getProfiles()
      show.info(`  - ${service.name}${profiles.length > 0 ? `: ${profiles.join(', ')}` : ''}`)
    })
  })

  show.info(`\nLLemonStack Version: ${colors.yellow(config.version)}`)

  const remoteCommits = await config.getRemoteCommits()
  if (remoteCommits.success && remoteCommits.data) {
    show.info(
      `LLemonStack is ${
        colors.yellow(remoteCommits.data.toString())
      } commits behind the remote repo`,
    )
  } else if (remoteCommits.data === 0) {
    show.info(`Up to date with the remote repo`)
  } else {
    show.info(`Unable to get LLemonStack remote repo status`)
  }

  show.info(`\nLLemonStack Install Dir: ${colors.yellow(config.installDir)}`)
  show.info(`Project Config File: ${colors.yellow(config.configFile)}`)

  const dirs = config.servicesDirs
  if (dirs.length === 1) {
    show.info(`Services Dir: ${colors.yellow(dirs[0])}`)
  } else {
    show.info(`Services Dirs:\n  ${colors.yellow('- ' + dirs.join('\n  - '))}`)
  }
}
