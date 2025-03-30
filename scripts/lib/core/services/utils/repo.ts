import { tryCatchRunCommand } from '@/lib/command.ts'
import { Service } from '@/lib/core/services/service.ts'
import { dirExists, escapePath, fileExists, path } from '@/lib/fs.ts'
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
  }: {
    pull?: boolean
    silent?: boolean
    captureOutput?: boolean
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
    // Dir does not exist, clone it and checkout sparse dirs if sparseDir config is set
    results.addMessage(
      'debug',
      `Cloning ${service.name} repo: ${repoConfig.url}${repoConfig.sparse ? ' [sparse]' : ''}`,
    )

    // Clone repo
    await runGit(results, {
      args: [
        '-C',
        escapePath(repoDir),
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
