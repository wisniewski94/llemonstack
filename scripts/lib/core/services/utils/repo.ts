import { tryCatchRunCommand } from '@/lib/command.ts'
import { Service } from '@/lib/core/services/service.ts'
import { dirExists, ensureDir, escapePath, fileExists, path } from '@/lib/fs.ts'
import { failure, success, TryCatchResult } from '@/lib/try-catch.ts'
import type { RunCommandOptions } from '@/types'

/**
 * Run a git command and add the results to the results object
 *
 * @param {TryCatchResult<boolean>} results - The results of the command
 * @param {string[]} args - The arguments to pass to the command
 * @param {boolean} silent - If true, command output is logged instead of shown
 * @param {boolean} captureOutput - If true, command output is captured
 */
async function runGit(
  results: TryCatchResult<boolean>,
  { args, silent, captureOutput = false }: RunCommandOptions,
): Promise<TryCatchResult<boolean>> {
  const gitResults = await tryCatchRunCommand('git', {
    args,
    silent,
    captureOutput,
  })

  results.addMessage('debug', `Git command: ${gitResults.data?.cmd}`)

  if (!gitResults.success) {
    results.error = gitResults.error
    results.addMessage('error', `Error running git command: ${args?.join(' ')}`, {
      error: gitResults.error,
    })
  }

  return results
}

/**
 * Clone or pull a repo
 *
 * Parent working dir needs to exist before running this function.
 *
 * @param {IRepoConfig} repoConfig - Repo config
 * @param {string} repoDir - Absolute path where the cloned repo will be placed
 * @param {boolean} [pull=false] - Pull latest changes from remote
 * @param {boolean} [silent=false] - When silent, command output is logged instead of shown
 */
export async function setupServiceRepo(
  service: Service,
  {
    pull = false, // Pull latest changes from remote
    silent = false,
    captureOutput = false,
    createBaseDir = false,
  }: {
    pull?: boolean
    silent?: boolean
    captureOutput?: boolean
    createBaseDir?: boolean
  },
): Promise<TryCatchResult<boolean>> {
  const results = success<boolean>(true)

  if (!service.repoDir) {
    return failure<boolean>(`Repo dir not set for ${service.name}`, results, false)
  }
  if (!service.repoConfig?.url) {
    return failure<boolean>(`Repo URL not set for ${service.name}`, results, false)
  }

  const repoDir = service.repoDir
  const repoConfig = service.repoConfig || {}
  const sparse = repoConfig.sparse || repoConfig.sparseDir

  // Check if repo dir exists
  const repoDirResults = await dirExists(repoDir)

  // Return failure if there was an error checking the repo dir
  if (!repoDirResults.success) {
    results.error = repoDirResults.error
    return failure<boolean>(`Error checking repo dir: ${repoDir}`, results, false)
  }

  // If repo does not exist, clone it
  if (!repoDirResults.data) {
    const repoBaseDir = path.dirname(repoDir)

    // Make sure repo base dir exists
    if (createBaseDir) {
      // Create repo base dir if it doesn't exist, but only if it's inside cwd
      const ensureDirResults = await ensureDir(repoBaseDir, { allowOutsideCwd: false })
      if (!ensureDirResults.success) {
        results.error = ensureDirResults.error
        return failure<boolean>(`Error creating repo base dir: ${repoBaseDir}`, results, false)
      }
    } else {
      // Check if repo base dir exists and return failure if it doesn't
      const repoBaseDirResults = await dirExists(repoBaseDir)
      if (!repoBaseDirResults.success || !repoBaseDirResults.data) {
        results.error = repoBaseDirResults.error
        return failure<boolean>(`Repos dir does not exist: ${repoBaseDir}`, results, false)
      }
    }

    // Dir does not exist, clone it and checkout sparse dirs if sparseDir config is set
    results.addMessage(
      'debug',
      `Cloning ${service.name} repo: ${repoConfig.url}${repoConfig.sparse ? ' [sparse]' : ''}`,
    )

    // Clone repo into base dir
    await runGit(results, {
      args: [
        '-C',
        escapePath(repoBaseDir),
        'clone',
        sparse ? '--filter=blob:none' : false,
        sparse ? '--no-checkout' : false,
        repoConfig.url,
        repoConfig.dir,
      ],
      silent,
      captureOutput,
    })

    // Spares checkout if spare config is set
    if (sparse) {
      await runGit(results, {
        args: [
          '-C',
          repoDir,
          'sparse-checkout',
          'init',
          '--cone',
        ],
        silent,
        captureOutput,
      })

      // Checkout sparse dirs if sparseDir config is set
      if (repoConfig.sparseDir) {
        await runGit(results, {
          args: [
            '-C',
            repoDir,
            'sparse-checkout',
            'set',
            ...[repoConfig.sparseDir].flat(),
          ],
          silent,
          captureOutput,
        })
      }

      await runGit(results, {
        args: [
          '-C',
          repoDir,
          'checkout',
        ],
        silent,
        captureOutput,
      })
    }
  } else {
    // Repo directory exists

    // Pull latest changes from remote if pull is true
    if (pull) {
      results.addMessage('debug', `${service.name} repo exists, pulling latest code...`)
      await runGit(results, {
        args: [
          '-C',
          repoDir,
          'pull',
        ],
        silent,
        captureOutput,
      })
    }

    // Check if the required file exists in the repo
    if (repoConfig.checkFile) {
      const checkFiles = Array.isArray(repoConfig.checkFile)
        ? repoConfig.checkFile
        : [repoConfig.checkFile]

      for (const checkFile of checkFiles) {
        if (
          !(await checkRepoFile({
            repoDir,
            checkFile,
            service,
            results,
          }))
        ) {
          return failure<boolean>(
            `Required repo file not found for ${service.name}: ${checkFile}`,
            results,
            false,
          )
        }
      }
    }

    results.addMessage('debug', `${service.name} repo is ready`)
  }

  return results
}

/**
 * Check if a file exists in the repo
 *
 * @param {string} repoDir - The directory of the repo
 * @param {string} checkFile - The file to check for
 * @param {Service} service - The service to check for
 */
async function checkRepoFile({
  repoDir,
  checkFile,
  service,
  results,
}: {
  repoDir: string
  checkFile: string
  service: Service
  results: TryCatchResult<boolean>
}): Promise<boolean> {
  const checkFilePath = path.join(repoDir, checkFile)

  const fileResults = await fileExists(checkFilePath)

  if (!fileResults.success) {
    const errMsg = `Required repo file not found for ${service.name}: ${checkFile}`

    results.addMessage('error', errMsg, { error: fileResults.error })

    // TODO: add new log type for user actions
    results.addMessage('warning', `Please check the repository structure and try again.`)

    return false
  }

  results.addMessage(
    'debug',
    `Repo check: required file found for ${service.name}: ${checkFile}`,
  )

  return true
}
