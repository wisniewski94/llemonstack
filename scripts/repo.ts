import { runCommand } from './lib/command.ts'
import { Service } from './lib/core/services/service.ts'
import { escapePath, fs, path } from './lib/fs.ts'
import { showDebug, showInfo, showUserAction, showWarning } from './lib/logger.ts'

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
): Promise<void> {
  if (!service.repoDir) {
    throw new Error(`Repo dir not set for ${service.name}`)
  }
  if (!service.repoConfig?.url) {
    throw new Error(`Repo URL not set for ${service.name}`)
  }

  const repoDir = service.repoDir
  const repoConfig = service.repoConfig || {}
  const sparse = repoConfig.sparse || repoConfig.sparseDir

  !silent && showDebug(
    `Cloning ${service.name} repo: ${repoConfig.url}${repoConfig.sparse ? ' [sparse]' : ''}`,
  )

  // Clone repo if repo dir doesn't exist
  if (!fs.existsSync(repoDir)) {
    await runCommand('git', {
      args: [
        '-C',
        escapePath(repoDir),
        'clone',
        sparse && '--filter=blob:none',
        sparse && '--no-checkout',
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
            ...[repoConfig.sparseDirs].flat(),
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
      !silent && showInfo(`${service.name} repo exists, pulling latest code...`)
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
        !silent && showWarning(errMsg)
        !silent && showUserAction(`Please check the repository structure and try again.`)
        throw new Error(errMsg)
      }
    }
    !silent && showInfo(`✔️ ${service.name} repo is ready`)
  }
}
