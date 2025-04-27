/**
 * Configure the services
 */
import { Config } from '@/core/config/config.ts'
import { path } from '@/lib/fs.ts'
import { colors } from '@cliffy/ansi/colors'
import { showServicesInfo } from './start.ts'

export async function info({
  config,
  hideCredentials = false,
}: {
  config: Config
  hideCredentials?: boolean
}): Promise<void> {
  const show = config.relayer.show

  // Project Info
  show.info(`Project Name: ${colors.yellow(config.projectName)}`)
  show.info(`Config File: ${colors.yellow(path.relative(Deno.cwd(), config.configFile))}`)

  // Services Dirs
  const dirs = config.servicesDirs
  if (dirs.length === 1) {
    show.info(`Services Dir: ${colors.yellow(dirs[0])}`)
  } else {
    show.info(`Services Dirs:\n  ${colors.yellow('- ' + dirs.join('\n  - '))}`)
  }

  // LLemonStack Info
  const remoteCommits = await config.getRemoteCommits()
  let versionMessage = ''
  if (remoteCommits.success && remoteCommits.data) {
    versionMessage = `commits behind the remote repo`
  } else if (remoteCommits.data === 0) {
    versionMessage = 'Up to date with remote repo'
  } else {
    show.warn(`Unable to get LLemonStack remote repo status`)
  }
  show.info(`\nLLemonStack Version: ${colors.yellow(config.version)} - ${versionMessage}`)
  show.info(`LLemonStack Install Dir: ${colors.yellow(config.installDir)}`)

  const serviceGroups = config.getServicesGroups()

  // Enabled Services
  show.header('Enabled Services')
  serviceGroups.forEach((groupServices, groupName) => {
    show.info(`${groupName}`)
    groupServices.getEnabled().forEach((service) => {
      const profiles = service.getProfiles()
      show.info(
        `- ${colors.green(service.name)}${profiles.length > 0 ? `: ${profiles.join(', ')}` : ''}`,
      )
    })
  })

  // Disabled Services
  show.header('Disabled Services')
  config.getAllServices().getDisabled().forEach((service) => {
    show.info(`- ${service.name}`)
  })

  // Running Services
  const runningServices = await config.getAllServices().filterAsync(async (s) => {
    return await s.isRunning()
  })
  if (runningServices.size > 0) {
    show.header('Running Services')
    showServicesInfo(runningServices, 'host.*', {
      hideCredentials,
      showAll: true,
      showInfo: false,
    })
  }

  console.log('')
}
