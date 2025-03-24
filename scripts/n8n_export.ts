#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Export workflows from n8n
 */

import { CommandError } from './lib/command.ts'
import { Config } from './lib/config/config.ts'
import { dockerExec } from './lib/docker.ts'
import { fs, path } from './lib/fs.ts'
import { showAction, showError, showInfo, showWarning } from './lib/logger.ts'
import { DEFAULT_PROJECT_NAME } from './start.ts'

const config = Config.getInstance()
await config.initialize()

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

async function runExportCommands(projectName: string): Promise<void> {
  for (const serviceCommand of SERVICES_EXPORT_COMMANDS) {
    const composeFile = config.getComposeFile(serviceCommand.service)
    if (!composeFile) {
      config.isEnabled(serviceCommand.service) &&
        showWarning(`Compose file not found for ${serviceCommand.service}, skipping`)
      continue
    }
    try {
      await dockerExec(projectName, serviceCommand.service, serviceCommand.cmd, {
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
export async function runExport(projectName: string): Promise<void> {
  showAction(`Preparing export folders in ./shared...`)
  const dirs = await prepareBackupDir()
  showInfo(`Export dirs:\n  ${dirs.map((d) => d[1]).join('\n  ')}`)
  showAction(`Exporting n8n workflows and credentials...`)
  try {
    await runExportCommands(projectName)
    showInfo(`Export complete`)
  } catch (error) {
    showError(`Error exporting n8n workflows and credentials`, error)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  runExport(Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME)
}
