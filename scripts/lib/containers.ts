/**
 * Container management functions
 *
 * Placeholder for future refactor
 */

// async function isContainerRunning(
//   projectName: string,
//   service: string,
//   { composeFile, silent = true }: { composeFile?: string; silent?: boolean } = {},
// ): Promise<boolean> {
//   if (!composeFile) {
//     composeFile = (await getComposeFile(service)) || undefined
//   }
//   if (!composeFile) {
//     throw new Error(`Compose file not found for ${service}`)
//   }
//   const name = (await runCommand('docker', {
//     args: [
//       'compose',
//       '-p',
//       projectName,
//       '-f',
//       composeFile,
//       'ps',
//       service,
//       '--format',
//       '{{.Names}}', // Only return the name of the container
//     ],
//     captureOutput: true,
//     silent,
//   })).toString().trim()

//   return !!name
// }
