#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Export workflows from n8n
 *
 * Usage:
 *
 * ```bash
 * deno run export
 * ```
 */

import * as fs from 'jsr:@std/fs'
import * as path from 'jsr:@std/path'
import {
  DEFAULT_PROJECT_NAME,
  getComposeFile,
  isEnabled,
  runCommand,
  showAction,
  showError,
  showInfo,
  showWarning,
} from './start.ts'

// Relative path of backup dir in shared dir
const BACKUP_DIR_N8N = 'backups/n8n'

const SERVICES_EXPORT_COMMANDS: ServiceExportCommand[] = [
  // Export workflows from n8n to the shared folder
  {
    service: 'n8n',
    hostDir: `shared/${BACKUP_DIR_N8N}/workflows`,
    cmd: 'n8n',
    args: ['export:workflow', '--backup', '--output', `/data/shared/${BACKUP_DIR_N8N}/workflows`],
  },
  // Export credentials from n8n to the shared folder
  {
    service: 'n8n',
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
  cmd: string
  args: string[]
  hostDir: string // Directory to export to on host
}

// TODO: replace with runContainerCommand in lib/containers.ts
/**
 * Execs a command in a running container
 * @param {string} projectName - The name of the project
 * @param {string} service - The name of the service
 * @param {string} composeFile - The path to the compose file
 * @param {string} entrypoint - The entrypoint of the service
 * @param {string[]} cmdArgs - The arguments to pass to the service
 * @returns {string} The output of the command
 */
async function runContainerCommand(
  projectName: string,
  service: string, // Service name
  composeFile: string, // Compose file
  entrypoint: string, // Entrypoint, app to run; e.g. 'node'
  cmdArgs: string[], // Args to pass to the app
  { silent = false }: { silent?: boolean } = {},
): Promise<string> {
  let results = ''
  try {
    // Execute a command inside a running container
    const cmdResult = await runCommand('docker', {
      args: [
        'compose',
        '-p',
        projectName,
        '-f',
        composeFile,
        'exec',
        service,
        entrypoint,
        ...cmdArgs,
      ],
      captureOutput: true,
      silent,
    })
    results = cmdResult.toString()
  } catch (error) {
    showError(`Error running command in ${service}`, error)
  }

  return results
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
    const composeFile = await getComposeFile(serviceCommand.service)
    if (!composeFile) {
      isEnabled(serviceCommand.service) &&
        showWarning(`Compose file not found for ${serviceCommand.service}, skipping`)
      continue
    }
    await runContainerCommand(
      projectName,
      serviceCommand.service,
      composeFile,
      serviceCommand.cmd,
      serviceCommand.args,
    )
  }
}
export async function runExport(projectName: string): Promise<void> {
  showAction(`Preparing export dirs in ./shared folder...`)
  const dirs = await prepareBackupDir()
  showInfo(`Export dirs:\n  ${dirs.map((d) => d[1]).join('\n  ')}`)
  showAction(`Exporting...`)
  await runExportCommands(projectName)
  showInfo(`Export complete`)
}

// Run script if this file is executed directly
if (import.meta.main) {
  runExport(Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME)
}
