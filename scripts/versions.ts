#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Show the versions of the services that support it
 */

import { colors } from '@cliffy/ansi/colors'
import { Row, RowType } from '@cliffy/table'
import { getImageFromCompose, getImagesFromComposeYaml } from './lib/compose.ts'
import { Config } from './lib/config.ts'
import { dockerRun, prepareDockerNetwork, runDockerCommand } from './lib/docker.ts'
import {
  showAction,
  showError,
  showHeader,
  showInfo,
  showTable,
  showWarning,
} from './lib/logger.ts'
import { ServiceImage } from './lib/types.d.ts'
import { DEFAULT_PROJECT_NAME, prepareEnv } from './start.ts'

const config = Config.getInstance()
await config.initialize()

const MAX_COLUMN_WIDTH = 50

/**
 * Services that support showing the software version
 * Creates a temporary container and runs the command to get the version.
 */
// TODO: move to llemonstack.yaml files
const SERVICES_WITH_APP_VERSION = {
  // Get n8n by running `n8n --version` in the container
  n8n: ['n8n', '--version'],
  // Get flowise version from the package.json file
  flowise: [
    'sh',
    '-c',
    'flowise --version | grep -o "flowise/[0-9]\\+\.[0-9]\\+\.[0-9]\\+" | cut -d\'/\' -f2',
  ],
  litellm: [
    'sh',
    '-c',
    'litellm -v | grep -o "[0-9\.]\\+"',
  ],
  langfuse: [
    'node',
    '-e',
    `console.log(require('/app/package.json').version)`,
  ],
  // EXAMPLE: get version from package.json file
  // serviceName: [
  //   'node',
  //   '-e',
  //   `console.log(require('/usr/local/lib/node_modules/app/package.json').version)`,
  // ],
} as Record<string, string[]>

/**
 * Returns the version of the service running in a container
 *
 * Starts a new container so there's a chance the version differs from any running containers.
 */
async function getAppVersion(
  projectName: string,
  service: string, // Service name
  composeFile: string, // Compose file
  entrypoint: string, // Entrypoint
  cmdArgs: string[], //
): Promise<ServiceImage> {
  let serviceImage: ServiceImage
  try {
    const tmp = await getImageFromCompose(composeFile, service)
    if (!tmp) {
      throw new Error(`Unable to get image from ${composeFile}`)
    }
    serviceImage = tmp
  } catch (error) {
    if (config.isEnabled(service)) {
      showError(`Error getting image for ${service}`, error)
    }
    serviceImage = {
      service,
      containerName: '',
      image: '',
    }
  }
  try {
    const version = (await dockerRun(
      projectName,
      service,
      entrypoint,
      { args: cmdArgs },
    )).toString().trim()
    // Get the last line of the output in case the version output multiple lines
    serviceImage.version = version.split('\n').pop() || ''
    return serviceImage
  } catch (error) {
    showError(`Error getting version for ${service}`, error)
  }
  return serviceImage
}

async function getAppVersions(projectName: string): Promise<string[][]> {
  // Get enabled services and process them in parallel
  const results = await Promise.all(
    Object.keys(SERVICES_WITH_APP_VERSION)
      .filter((service) => config.isEnabled(service))
      .map(async (service) => {
        const composeFile = config.getComposeFile(service)
        if (!composeFile) {
          showWarning(`Compose file not found for ${service}`)
          return { service, containerName: '', version: '', image: '' } as ServiceImage
        }
        const [entrypoint, ...args] = SERVICES_WITH_APP_VERSION[service]
        const serviceImage = await getAppVersion(
          projectName,
          service,
          composeFile,
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

async function showImageVersions(): Promise<RowType[]> {
  // Iterate through all compose files to get images
  // Process all compose files in parallel
  const composeResults = await Promise.all(
    config.getComposeFiles({ all: true }).map(async (composeFile) => {
      let images: ServiceImage[] = []
      try {
        images = await getImagesFromComposeYaml(composeFile)
        return { composeFile, images, error: null }
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          showWarning(`Compose file (${composeFile}) not found, skipping`)
          return { composeFile, images: [], error }
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
        } catch (_error) {
          // ignore error
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
          const version = (await runDockerCommand('inspect', {
            args: [
              '--format',
              '{{index .Config.Labels "org.opencontainers.image.version"}}',
              serviceImage.image,
            ],
            captureOutput: true,
            silent: true,
          })).toString().trim()
          serviceImage.version = version ? version : 'N/A'
        } catch (_error) {
          // ignore error
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

export async function versions(projectName: string): Promise<void> {
  showAction(`Getting versions for ${projectName}...`)
  showInfo(
    'Versions shown may differ from running containers.\n' +
      'Restart the stack to ensure the versions are correct.',
  )
  showHeader('Docker Image Versions')

  await prepareEnv({ silent: true })
  await prepareDockerNetwork()

  try {
    const appVersionsPromise = (Object.keys(SERVICES_WITH_APP_VERSION).length > 0)
      ? getAppVersions(projectName)
      : Promise.resolve([])

    const imageVersionRows = await showImageVersions()

    if (imageVersionRows.length > 0) {
      showTable(
        [
          'Service',
          'Image Version',
          'Container',
          'Docker Image',
          'Compose File',
        ],
        imageVersionRows,
        MAX_COLUMN_WIDTH,
      )
    }

    showHeader('Service App Versions')
    const appVersionRows = await appVersionsPromise
    if (appVersionRows.length > 0) {
      showInfo('Version of apps inside the container, if available.\n')
      showTable(['Service', 'App Version', 'Docker Image'], appVersionRows, MAX_COLUMN_WIDTH)
    } else {
      showInfo('No app versions found')
    }
    console.log('\n')
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  versions(Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME)
}
