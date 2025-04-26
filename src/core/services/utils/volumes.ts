import { fs, path } from '@/lib/fs.ts'
import { failure, success } from '@/lib/try-catch.ts'
import type { ServiceType, TryCatchResult } from '@/types'

/**
 * Get the relative path of a given path
 *
 * @param pathStr - The path to get the relative path of
 * @returns The relative path of the given path
 */
function getRelativePath(pathStr: string): string {
  return path.relative(Deno.cwd(), pathStr)
}

/**
 * Prepare volumes for a service
 *
 * @param service - The service to prepare volumes for
 * @param volumesDir - The base volumes where the service volumes will be created
 * @returns A TryCatchResult<boolean> indicating success or failure
 */
export async function prepareServiceVolumes(
  service: ServiceType,
  volumesDir: string,
): Promise<TryCatchResult<boolean>> {
  const results = success<boolean>(true)

  // Return early if service has no volumes or seeds
  if (service.volumes.length === 0 && service.volumesSeeds.length === 0) {
    return results
  }

  results.addMessage('debug', `Creating required volumes for ${service.name}...`)

  // Create any required volume dirs
  for (const volume of service.volumes) {
    const volumePath = path.join(volumesDir, volume)
    try {
      // TODO: replace with dirExists
      const fileInfo = await Deno.stat(volumePath)
      if (fileInfo.isDirectory) {
        results.addMessage('debug', `✔️ ${volume}`)
      } else {
        return failure<boolean>(`Volume is not a directory: ${volumePath}`, results, false)
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        await Deno.mkdir(volumePath, { recursive: true })
        results.addMessage('info', `Created missing volume dir: ${volumePath}`)
      } else {
        results.error = error as Error
        return failure<boolean>(`Error creating volume dir: ${volumePath}`, results, false)
      }
    }
  }

  // Copy any seed directories if needed
  for (const seed of service.volumesSeeds) {
    const seedPath = path.join(volumesDir, seed.destination)
    try {
      // Check if seedPath already exists before copying
      // TODO: replace with fileExists
      const seedPathExists = await fs.exists(seedPath)
      if (seedPathExists) {
        results.addMessage('debug', `Volume seed already exists: ${getRelativePath(seedPath)}`)
        continue
      }
      let seedSource = seed.source
      if (seed.from_repo && service.repoDir) {
        seedSource = path.join(service.repoDir, seed.source)
      } else {
        return failure<boolean>(
          `Volume seed requires repo to exist: ${seed.source}`,
          results,
          false,
        )
      }
      await fs.copy(seedSource, seedPath, { overwrite: false })
      results.addMessage(
        'info',
        `Copied ${getRelativePath(seedSource)} to ${getRelativePath(seedPath)}`,
      )
    } catch (error) {
      results.error = error as Error
      return failure<boolean>(
        `Error copying seed: ${getRelativePath(seed.source)} to ${getRelativePath(seedPath)}`,
        results,
        false,
      )
    }
  }

  return results
}
