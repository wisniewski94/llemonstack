#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Show the versions of the services that support it
 *
 * Usage:
 *
 * ```bash
 * deno run versions
 * ```
 */

import {
  ALL_COMPOSE_FILES,
  DEFAULT_PROJECT_NAME,
  getComposeFile,
  getImageFromCompose,
  getImagesFromComposeYml,
  isEnabled,
  prepareEnv,
  runCommand,
  ServiceImage,
  showAction,
  showError,
  showHeader,
  showInfo,
  showWarning,
} from './start.ts'

import { colors } from '@cliffy/ansi/colors'
import { Column, RowType, Table } from '@cliffy/table'

const COMPOSE_FILES = ALL_COMPOSE_FILES

/**
 * Services that support showing the software version
 * Creates a temporary container and runs the command to get the version.
 */
const SERVICES_WITH_APP_VERSION = {
  // Get n8n by running `n8n --version` in the container
  n8n: ['n8n', '--version'],
  // Get flowise version from the package.json file
  flowise: [
    'flowise',
    '--version',
  ],
  litellm: [
    'sh',
    '-c',
    'litellm -v | grep -o "[0-9\.]\\+"',
  ],
  // EXAMPLE: get version from package.json file
  // serviceName: [
  //   'node',
  //   '-e',
  //   `console.log(require('/usr/local/lib/node_modules/app/package.json').version)`,
  // ],
} as Record<string, string[]>

function showTable(header: string[], rows: RowType[]) {
  new Table()
    .header(header.map((h) => colors.underline(h)))
    .body(rows)
    .padding(2)
    .indent(2)
    .border(false)
    .column(0, new Column().align('right'))
    .sort()
    .render()
}

/**
 * Returns the version of the service running in a container
 *
 * Starts a new container so there's a chance the version differs from any running containers.
 */
async function getAppVersion(
  service: string, // Service name
  composeFile: string, // Compose file
  entrypoint: string, // Entrypoint
  cmdArgs: string[], //
): Promise<[string | null, string | null]> {
  let version = null
  let image = null
  try {
    image = (await getImageFromCompose(composeFile, service))?.image
  } catch (error) {
    if (isEnabled(service)) {
      showError(`Error getting image for ${service}`, error)
    }
  }
  if (image) {
    try {
      // Check if image for service is installed
      const imageId = (await runCommand('docker', {
        args: [
          'image',
          'ls',
          '-q',
          image,
        ],
        captureOutput: true,
        silent: true,
      })).toString().trim()
      if (imageId) {
        // Run the image and get the version of the service
        version = (await runCommand('docker', {
          args: [
            'run',
            '--rm',
            '--entrypoint',
            entrypoint,
            image,
            ...cmdArgs,
          ],
          captureOutput: true,
          silent: true,
        })).toString().trim()
      } else {
        showInfo(`Image ${image} not installed, skipping`)
      }
    } catch (error) {
      showError(`Error getting version for ${service}`, error)
    }
  }
  return [version || null, image || null]
}

async function showAppVersions(): Promise<void> {
  // Define proper type for versions object with index signature
  const rows: string[][] = []

  for (const service of Object.keys(SERVICES_WITH_APP_VERSION)) {
    const composeFile = await getComposeFile(service)
    if (!composeFile) {
      isEnabled(service) &&
        showWarning(`Compose file not found for ${service}`)
      continue
    }
    const [entrypoint, ...args] = SERVICES_WITH_APP_VERSION[service]
    if (isEnabled(service)) {
      const [version, image] = await getAppVersion(
        service,
        composeFile,
        entrypoint,
        args,
      )
      const ver = `${version || 'not available'}`
      rows.push([
        colors.yellow(service),
        colors.green.bold(ver),
        colors.gray(image || ''),
      ])
    }
  }
  showTable(['Service', 'App Version', 'Docker Image'], rows)
}

async function showImageVersions(): Promise<void> {
  // Iterate through all compose files to get images
  for (const composeFile of COMPOSE_FILES) {
    let images: ServiceImage[]
    try {
      images = await getImagesFromComposeYml(composeFile)
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        showWarning(`Compose file (${composeFile}) not found, skipping`)
        continue
      } else {
        throw error
      }
    }

    // Sort images by service name alphabetically
    images.sort((a, b) => {
      return a.service.localeCompare(b.service)
    })

    // Define proper type for versions object with index signature
    // type Version = { Version: string; 'Docker Image': string }
    const rows: RowType[] = []

    for (const { service, image } of images) {
      // Get image and version from the image string
      // If the image is a variable, use the variable name as the image
      const [img, _, version = 'latest'] = image.startsWith('${')
        ? [image, '', '']
        : image.match(/^(.*?)(?::([^:]*))?$/) || ['', '', '']
      rows.push([service, version, img])
    }

    // If version is "latest" or "main", try to get version from the docker inspect
    for (const i in rows) {
      if (/latest|main/i.test(rows[i][1]?.toString() || '')) {
        try {
          const version = (await runCommand('docker', {
            args: [
              'inspect',
              '--format',
              '{{index .Config.Labels "org.opencontainers.image.version"}}',
              rows[i][2] as string,
            ],
            captureOutput: true,
            silent: true,
          })).toString().trim()
          if (version) {
            rows[i][1] = version
          } else {
            rows[i][1] = '???'
          }
        } catch (_error) {
          // ignore error
        }
      }
    }

    // Apply colors to each row
    for (let i = 0; i < rows.length; i++) {
      rows[i] = [
        colors.yellow(rows[i][0] as string),
        colors.green.bold(rows[i][1] as string),
        colors.gray(rows[i][2] as string),
      ]
    }

    console.log(colors.gray(`\n Source: ${composeFile}`))
    showTable(['Service', 'Version', 'Docker Image'], rows)
  }
}

export async function versions(projectName: string): Promise<void> {
  showAction(`Getting versions for ${projectName}...`)
  showInfo(
    'Versions shown may differ from running containers.\n' +
      'Restart the stack to ensure the versions are correct.',
  )
  showHeader('Docker Image Versions')

  await prepareEnv({ silent: true })

  try {
    await showImageVersions()

    if (Object.keys(SERVICES_WITH_APP_VERSION).length > 0) {
      showHeader('Service App Versions')
      showInfo('Version of the service app inside the container if available.\n')
      await showAppVersions()
    }
    console.log('\n')
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  versions(Deno.env.get('DOCKER_PROJECT_NAME') || DEFAULT_PROJECT_NAME)
}
