/**
 * TryCatch wrapper for fs operations
 */

import * as fs from 'jsr:@std/fs'
import * as path from 'jsr:@std/path'
import * as yaml from 'jsr:@std/yaml'
import { failure, tryCatch, tryCatchBoolean, TryCatchResult } from './try-catch.ts'

// Re-export fs and path
export { fs, path }

/**
 * Escape special characters in a path
 * @param file - The file path to escape
 * @returns The escaped path
 */
export function escapePath(file: string): string {
  return path.normalize(file.replace(/(\s|`|\$|\\|"|&)/g, '\\$1'))
}

export async function fileExists(path: string): Promise<TryCatchResult<boolean>> {
  try {
    const fileInfo = await Deno.stat(path)
    if (fileInfo.isFile) {
      return new TryCatchResult<boolean>({ data: true, error: null, success: true })
    } else {
      return new TryCatchResult<boolean>({
        data: false,
        error: new Error(`Path exists but is not a file: ${path}`),
        success: false,
      })
    }
  } catch (error) {
    return new TryCatchResult<boolean>({ data: false, error: error as Error, success: false })
  }
}

export async function dirExists(path: string): Promise<TryCatchResult<boolean>> {
  try {
    const fileInfo = await Deno.stat(path)
    if (fileInfo.isDirectory) {
      return new TryCatchResult<boolean>({ data: true, error: null, success: true })
    } else {
      return new TryCatchResult<boolean>({
        data: true,
        error: new Error(`Path exists but is not a directory: ${path}`),
        success: false,
      })
    }
  } catch (error) {
    return new TryCatchResult<boolean>({ data: false, error: error as Error, success: false })
  }
}

export async function readDir(
  dirPath: string,
): Promise<TryCatchResult<AsyncIterable<Deno.DirEntry>>> {
  return await tryCatch(Deno.readDir(dirPath))
}

export async function readTextFile(
  filePath: string,
): Promise<TryCatchResult<string>> {
  return await tryCatch(Deno.readTextFile(filePath))
}

export function isInsideCwd(filePath: string): TryCatchResult<boolean> {
  const cwd = Deno.cwd()
  const relativePath = path.relative(cwd, filePath)
  return new TryCatchResult<boolean>({ data: relativePath !== '', error: null, success: true })
}

export async function saveJson(filePath: string, data: unknown): Promise<TryCatchResult<boolean>> {
  const dirResult = await tryCatch(fs.ensureDir(path.dirname(filePath)))
  if (!dirResult.success) {
    return new TryCatchResult<boolean, Error>({
      data: false,
      error: dirResult.error || new Error('Unknown error'),
      success: false,
    })
  }
  return await tryCatchBoolean(Deno.writeTextFile(filePath, JSON.stringify(data, null, 2)))
}

/**
 * Update a .env file with new environment variables values
 * @param filePath - The path to the .env file
 * @param envVars - The environment variables to save
 * @returns A TryCatchResult<boolean>
 */
export async function updateEnv(
  filePath: string,
  envVars: Record<string, string>,
): Promise<TryCatchResult<boolean>> {
  const results = new TryCatchResult<boolean>({
    data: true,
    error: null,
    success: true,
  })

  const envDir = path.dirname(filePath)

  const dirResult = await tryCatch(fs.ensureDir(envDir))

  if (!dirResult.success) {
    return failure<boolean>(
      `Unable to save env file, dir does not exist: ${envDir}`,
      dirResult,
    )
  }

  // Load existing env file content to update, if any
  const readResults = await readTextFile(filePath)

  if (!readResults.success) {
    results.addMessage('debug', `Creating new .env file: ${filePath}`)
  }

  const envFileContent = readResults.success ? readResults.data || '' : ''
  const updatedEnvFileContent = Object.entries(envVars).reduce((acc, [key, value]) => {
    // Keep existing value in .env if envVars value not set
    if (!value) return acc

    // Replace existing key value with new value
    const tmp = acc.replace(new RegExp(`${key}=.*`, 'g'), `${key}=${value}`)

    // If the key is not found in the .env file, add it to the end of the file
    if (tmp === acc && !acc.includes(`${key}=${value}`)) {
      results.addMessage('debug', `Key '${key}' not found in env file, adding to end of file`)
      return `${acc}\n${key}=${value}\n`
    }

    return tmp
  }, envFileContent)

  const writeResults = await tryCatchBoolean(Deno.writeTextFile(filePath, updatedEnvFileContent))

  if (!writeResults.success) {
    results.error = writeResults.error
    results.addMessage('error', `Unable to save env file: ${filePath}`, {
      error: writeResults.error,
    })
  }

  return results
}

/**
 * Read a JSON file
 * @param filePath - The path to the JSON file
 * @returns A TryCatchResult object with the result of the operation
 */
export async function readJson<T>(filePath: string): Promise<TryCatchResult<T>> {
  return await tryCatch(
    Deno.readTextFile(filePath).then((contents) => JSON.parse(contents) as T),
  )
}

/**
 * Read and parse a YAML file
 * @param filePath - The path to the YAML file
 * @returns A TryCatchResult object with the result of the operation
 */
export async function readYaml<T>(filePath: string): Promise<TryCatchResult<T>> {
  return await tryCatch(
    Deno.readTextFile(filePath).then((contents) => yaml.parse(contents) as T),
  )
}
