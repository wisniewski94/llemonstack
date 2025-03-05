/**
 * Container management library
 *
 * WIP: move common lib functions here
 */
import { getComposeFile, runCommand, RunCommandOutput } from '../start.ts'

export async function runContainerCommand(
  projectName: string,
  service: string,
  cmd: string,
  { composeFile, args, silent = true, captureOutput = false }: {
    composeFile?: string
    args?: Array<string | false>
    silent?: boolean
    captureOutput?: boolean
  } = {},
): Promise<RunCommandOutput> {
  if (!composeFile) {
    composeFile = (await getComposeFile(service)) || undefined
  }
  if (!composeFile) {
    throw new Error(`Compose file not found for ${service}`)
  }
  // docker compose exec [OPTIONS] SERVICE COMMAND
  return await runCommand('docker', {
    args: [
      'compose',
      '-p',
      projectName,
      '-f',
      composeFile,
      'exec',
      service,
      cmd,
      ...(args || []),
    ],
    captureOutput,
    silent,
  })
}
