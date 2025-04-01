/**
 * Export workflows from n8n
 */

import { CommandError } from '@/lib/command.ts'
import { dockerExec } from '@/lib/docker.ts'
import { fs, path } from '@/lib/fs.ts'
import { showAction, showError, showInfo, showWarning } from '@/lib/logger.ts'
import { Config } from '../src/core/config/config.ts'

// Relative path of backup dir in shared dir
const BACKUP_DIR_N8N = 'backups/n8n'

const SERVICES_EXPORT_COMMANDS: ServiceExportCommand[] = [
  // Export workflows from n8n to the shared folder
  {
    service: 'n8n',
    type: 'workflows',
    hostDir: `shared/${BACKUP_DIR_N8N}/workflows`,
    cmd: 'n8n',
    args: ['export:workflow', '--backup', '--output', `/data/shared/${BACKUP_DIR_N8N}/workflows`],
  },
  // Export credentials from n8n to the shared folder
  {
    service: 'n8n',
    type: 'credentials',
    hostDir: `shared/${BACKUP_DIR_N8N}/credentials`,
    cmd: 'n8n',
    args: [
      'export:credentials',
      '--backup',
      '--decrypted',
      '--output',
      `/data/shared/${BACKUP_DIR_N8N}/credentials`,
    ],
  },
]

interface ServiceExportCommand {
  service: string
  type: 'workflows' | 'credentials'
  cmd: string
  args: string[]
  hostDir: string // Directory to export to on host
}

type BackupDirs = [service: string, backupDir: string][]
async function prepareBackupDir(): Promise<BackupDirs> {
  const dirs: BackupDirs = []
  for (const serviceCommand of SERVICES_EXPORT_COMMANDS) {
    const backupDir = path.join(Deno.cwd(), serviceCommand.hostDir)
    await fs.ensureDir(backupDir)
    dirs.push([serviceCommand.service, serviceCommand.hostDir])
  }
  return dirs
}

async function runExportCommands(config: Config): Promise<void> {
  for (const serviceCommand of SERVICES_EXPORT_COMMANDS) {
    const service = config.getServiceByName(serviceCommand.service)
    if (!service) {
      showWarning(`Service ${serviceCommand.service} not found, skipping`)
      continue
    }
    const composeFile = service.composeFile
    if (!composeFile) {
      service.isEnabled() &&
        showWarning(`Compose file not found for ${serviceCommand.service}, skipping`)
      continue
    }
    try {
      await dockerExec(config.projectName, serviceCommand.service, serviceCommand.cmd, {
        args: serviceCommand.args,
        composeFile,
        captureOutput: true,
      })
    } catch (error) {
      if (error instanceof CommandError) {
        if (!error.stderr.match(/no (workflows|credentials) found/ig)) {
          showInfo(`No ${serviceCommand.type} found to export.\n`)
        }
      } else {
        showError(`Error exporting ${serviceCommand.service}`, error)
      }
    }
  }
}
export async function runExport(config: Config): Promise<void> {
  showAction(`Preparing export folders in ./shared...`)
  const dirs = await prepareBackupDir()
  showInfo(`Export dirs:\n  ${dirs.map((d) => d[1]).join('\n  ')}`)
  showAction(`Exporting n8n workflows and credentials...`)
  try {
    await runExportCommands(config)
    showInfo(`Export complete`)
  } catch (error) {
    showError(`Error exporting n8n workflows and credentials`, error)
  }
}
