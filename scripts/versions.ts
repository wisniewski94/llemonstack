/**
 * Show the versions of the services that support it
 */

import { tryRunCommand } from '@/lib/command.ts'
import { getImageFromCompose, getImagesFromComposeYaml } from '@/lib/compose.ts'
import { dockerRun } from '@/lib/docker.ts'
import { InterfaceRelayer } from '@/relayer/ui/interface.ts'
import {
  IServiceImage,
  RunCommandOutput,
  ServicesMapType,
  ServiceType,
  TryCatchResult,
} from '@/types'
import { colors } from '@cliffy/ansi/colors'
import { Column, Row, RowType } from '@cliffy/table'
import packageJson from '@packageJson' with { type: 'json' }
import { Config } from '../src/core/config/config.ts'

const MAX_COLUMN_WIDTH = 50

/**
 * Wrapper around showTable to align columns
 * @param header
 * @param rows
 * @param options
 */
function showVersionsTable(
  show: InterfaceRelayer,
  header: RowType,
  rows: RowType[],
  options: { maxColumnWidth?: number },
): void {
  const table = show.table(header, rows, { ...options, render: false })
  table.column(0, new Column().align('right'))
  table.column(3, new Column().align('right'))
  table.render()
}

/**
 * Returns the version of the service running in a container
 *
 * Starts a new container so there's a chance the version differs from any running containers.
 */
async function getAppVersion(
  config: Config,
  service: ServiceType, // Service name
  entrypoint: string, // Entrypoint
  cmdArgs: string[], //
): Promise<IServiceImage> {
  const show = config.relayer.show
  let serviceImage: IServiceImage
  try {
    const tmp = await getImageFromCompose(service.composeFile, service.service)
    if (!tmp) {
      throw new Error(`Unable to get image from ${service.composeFile}`)
    }
    serviceImage = tmp
  } catch (error) {
    if (service.isEnabled()) {
      show.error(`Error getting image for ${service.name}`, { error })
    }
    serviceImage = {
      service: service.name,
      containerName: '',
      image: '',
    }
  }
  try {
    const version = (await dockerRun(
      config.projectName,
      service.service,
      entrypoint,
      { args: cmdArgs },
    )).toString().trim()
    // Get the last line of the output in case the version output multiple lines
    serviceImage.version = version.split('\n').pop() || ''
    return serviceImage
  } catch (error) {
    show.error(`Error getting version for ${service}`, { error })
  }
  return serviceImage
}

async function getAppVersions(config: Config, services: ServicesMapType): Promise<string[][]> {
  const show = config.relayer.show

  // Get enabled services and process them in parallel
  const results = await Promise.all(
    services.filterMap((service) => {
      const composeFile = service.composeFile
      if (!composeFile) {
        show.warn(`Compose file not found for ${service}`)
        return {
          service: service.name,
          containerName: '',
          version: '',
          image: '',
        } as IServiceImage
      }
      const [entrypoint, ...args] = service.appVersionCmd || []
      const serviceImage = getAppVersion(
        config,
        service,
        entrypoint,
        args,
      )
      return serviceImage
    }),
  )
  const rows = results.map((serviceImage) => [
    colors.yellow(serviceImage.service),
    colors.green.bold(serviceImage.version || 'not available'),
    colors.gray(serviceImage.image || serviceImage.build || ''),
  ])
  return rows
}

async function showImageVersions(config: Config): Promise<RowType[]> {
  const relayer = config.relayer
  const show = relayer.show

  // Iterate through all compose files to get images
  // Process all compose files in parallel
  const composeResults = await Promise.all(
    config.getAllServices().map(async (service) => {
      let images: IServiceImage[] = []
      try {
        images = await getImagesFromComposeYaml(service.composeFile)
        return { composeFile: service.composeFile, images, error: null }
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          show.warn(`Compose file (${service.composeFile}) not found, skipping`)
          return { composeFile: service.composeFile, images: [], error }
        } else {
          throw error
        }
      }
    }),
  )

  // Collect all rows for a single table
  const allRows: RowType[] = []

  // Process each valid result
  for (const { composeFile, images, error } of composeResults) {
    if (error instanceof Deno.errors.NotFound || images.length === 0) {
      continue
    }

    // Sort images by service name alphabetically
    images.sort((a, b) => {
      return a.service.localeCompare(b.service)
    })

    // Try to get image name and version from the image string
    for (const serviceImage of images) {
      // Skip empty image and build strings
      if (!serviceImage.image && !serviceImage.build) {
        continue
      }
      // Expand variables in the build string
      // e.g. Browser Use uses ${DOCKERFILE:-Dockerfile}
      if (serviceImage.build?.includes('${')) {
        try {
          // Replace ${VAR} or ${VAR:-default} patterns with their values
          serviceImage.build = serviceImage.build.replace(
            /\${([A-Za-z0-9_]+):-([^}]*)}/g,
            (_match, varName, defaultValue) => {
              const envValue = Deno.env.get(varName)
              return envValue !== undefined ? envValue : (defaultValue || '')
            },
          )
        } catch (error) {
          relayer.error('Error expanding variables in build string', { error })
        }
        continue
      }

      // Get image name and version by splitting image string on ":"
      const [_, imageName, version] = serviceImage.image.match(/^(.*?)(?::([^:]*))?$/) as string[]
      serviceImage.version = version
      serviceImage.imageName = imageName || serviceImage.image ||
        (serviceImage.build && 'Custom')
    }

    // Try to get accurate version from the docker inspect if version is empty, "latest" or "main"
    for (const serviceImage of images) {
      // Skip for custom builds
      if (!serviceImage.version && serviceImage.build) {
        serviceImage.version = 'Custom'
        continue
      }
      if (!serviceImage.version || /latest|main/i.test(serviceImage.version || '')) {
        try {
          const results = await config.relayer.withLevel<TryCatchResult<RunCommandOutput>>(
            'silent',
            () => {
              return tryRunCommand('docker', {
                args: [
                  'inspect',
                  '--format',
                  '{{index .Config.Labels "org.opencontainers.image.version"}}',
                  serviceImage.image,
                ],
                captureOutput: true,
                silent: true,
              })
            },
          )

          let version = 'N/A'
          if (!results.success) {
            relayer.debug('Error getting version from docker inspect for {image}', serviceImage)
          } else {
            version = results.toString().trim()
          }

          serviceImage.version = version
        } catch (error) {
          // Ignore the error but log it for debugging
          relayer.debug('Error getting version from docker inspect', error as Error)
        }
      }
    }

    // Build table rows with colors
    for (const serviceImage of images) {
      allRows.push([
        colors.yellow(serviceImage.service),
        /n\/a|custom/i.test(serviceImage.version || '')
          ? colors.gray(serviceImage.version || '')
          : colors.green.bold(serviceImage.version || ''),
        serviceImage.containerName,
        colors.gray(serviceImage.image || serviceImage.build || ''),
        colors.gray(composeFile),
      ])
    }
    // End of compose file
    // Add a blank row
    allRows.push(new Row(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ).border(false))
  }

  return allRows
}

export async function versions(config: Config): Promise<void> {
  const show = config.relayer.show

  show.info('LLemonStack CLI v{version}', packageJson)

  show.info(`Project: ${config.projectName}`)
  show.action(`Getting stack services versions...`)
  show.info(
    'Versions shown may differ from running containers.\n' +
      'Restart the stack to ensure the versions are correct.',
  )
  show.header('Docker Image Versions')

  const prepareResult = await config.prepareEnv()
  if (!prepareResult.success) {
    show.logMessages(prepareResult.messages)
    Deno.exit(1)
  }

  try {
    const services = config.getEnabledServices().filter((service) => service.appVersionCmd !== null)

    const appVersionsPromise = services.size > 0
      ? getAppVersions(config, services)
      : Promise.resolve([])

    const imageVersionRows = await showImageVersions(config)

    if (imageVersionRows.length > 0) {
      showVersionsTable(
        config.relayer.show,
        [
          'Service',
          'Image Version',
          'Container',
          'Docker Image',
          'Compose File',
        ],
        imageVersionRows,
        { maxColumnWidth: MAX_COLUMN_WIDTH },
      )
    }

    show.header('Service App Versions')
    const appVersionRows = await appVersionsPromise

    // Sort app version rows by service name (first column)
    appVersionRows.sort((a, b) => {
      const serviceA = colors.stripAnsiCode(a[0])
      const serviceB = colors.stripAnsiCode(b[0])
      return serviceA.localeCompare(serviceB)
    })

    if (appVersionRows.length > 0) {
      show.info('Version of apps inside the container, if available.\n')
      show.table(['Service', 'App Version', 'Docker Image'], appVersionRows, {
        maxColumnWidth: MAX_COLUMN_WIDTH,
      })
    } else {
      show.info('No app versions found')
    }
    console.log('\n')
  } catch (error) {
    show.error(error as Error)
  }
}
