import { runCommand } from '@/lib/command.ts'
import { Service } from '@/lib/core/services/service.ts'
import { escapePath, fs, path } from '@/lib/fs.ts'
import { failure, success, TryCatchResult } from '@/lib/try-catch.ts'

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
  }: {
    pull?: boolean
    silent?: boolean
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

  results.addMessage(
    'info',
    `Cloning ${service.name} repo: ${repoConfig.url}${repoConfig.sparse ? ' [sparse]' : ''}`,
  )

  // Clone repo if repo dir doesn't exist
  if (!fs.existsSync(repoDir)) {
    await runCommand('git', {
      args: [
        '-C',
        escapePath(repoDir),
        'clone',
        sparse ? '--filter=blob:none' : false,
        sparse ? '--no-checkout' : false,
        repoConfig.url,
        repoConfig.dir,
      ],
    })

    // Spares checkout if spare config is set
    if (sparse) {
      await runCommand('git', {
        args: [
          '-C',
          repoDir,
          'sparse-checkout',
          'init',
          '--cone',
        ],
      })

      // Checkout sparse dirs if sparseDir config is set
      if (repoConfig.sparseDir) {
        await runCommand('git', {
          args: [
            '-C',
            repoDir,
            'sparse-checkout',
            'set',
            ...[repoConfig.sparseDir].flat(),
          ],
        })
      }

      await runCommand('git', {
        args: [
          '-C',
          repoDir,
          'checkout',
        ],
      })
    }
  } else {
    // Repo directory exists

    // Pull latest changes from remote if pull is true
    if (pull) {
      results.addMessage('info', `${service.name} repo exists, pulling latest code...`)
      await runCommand('git', {
        args: [
          '-C',
          repoDir,
          'pull',
        ],
      })
    }

    // Check if the required file exists in the repo
    if (repoConfig.checkFile) {
      const checkFilePath = path.join(repoDir, repoConfig.checkFile)
      if (!await fs.exists(checkFilePath)) {
        const errMsg =
          `Required file ${repoConfig.checkFile} not found in ${service.name} directory: ${repoDir}`
        results.addMessage('warning', errMsg)
        results.addMessage('warning', `Please check the repository structure and try again.`)
        return failure<boolean>(errMsg, results, false)
      }
    }
    results.addMessage('info', `✔️ ${service.name} repo is ready`)
  }

  return results
}
