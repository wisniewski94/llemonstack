/**
 * TryCatch wrapper for fs operations
 */

import * as fs from 'jsr:@std/fs'
import * as path from 'jsr:@std/path'
import * as yaml from 'jsr:@std/yaml'
import { failure, success, tryCatch, tryCatchBoolean, TryCatchResult } from './try-catch.ts'

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

// TODO: add tests for this function
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
    // Return success if the error is a NotFound error
    if (error instanceof Deno.errors.NotFound) {
      return new TryCatchResult<boolean>({ data: false, error: null, success: true })
    }
    // Return all other errors as a failure
    return new TryCatchResult<boolean>({ data: false, error: error as Error, success: false })
  }
}

// TODO: add tests for this function
export async function dirExists(path: string): Promise<TryCatchResult<boolean>> {
  // TODO: use tryCatch to reduce code duplication
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
    // Return success if the error is a NotFound error
    if (error instanceof Deno.errors.NotFound) {
      return new TryCatchResult<boolean>({ data: false, error: null, success: true })
    }
    // Return all other errors as a failure
    return new TryCatchResult<boolean>({ data: false, error: error as Error, success: false })
  }
}

/**
 * Create a dir if it doesn't exist
 *
 * @param {string} dir - The path of the dir to create
 * @param {boolean} [allowOutsideCwd=false] - If true, allow the dir to be created outside of cwd
 * @returns {TryCatchResult<boolean>} The results of the operation
 */
export async function ensureDir(
  dir: string,
  { allowOutsideCwd = false }: { allowOutsideCwd?: boolean } = {},
): Promise<TryCatchResult<boolean>> {
  const results = success<boolean>(true)

  results.addMessage('debug', `Ensuring dir: ${dir}`)

  if (!allowOutsideCwd && !isInsideCwd(dir)) {
    // Check if dir already exists and return success if it does
    if ((await dirExists(dir)).data) {
      return results
    }
    // Otherwise return failure
    return failure<boolean>(`Unable to create dir outside of cwd: ${dir}`, results, false)
  }

  const ensureDirResults = await tryCatch(fs.ensureDir(dir))
  if (!ensureDirResults.success) {
    results.error = ensureDirResults.error
    return failure<boolean>(`Error creating dir: ${dir}`, results, false)
  }

  return results
}

export async function isDirEmpty(dirPath: string): Promise<TryCatchResult<boolean>> {
  const results = await readDir(dirPath)
  if (!results.success || !results.data) {
    return failure<boolean>(`Error reading directory: ${dirPath}`, results, false)
  }
  for await (const _ of results.data) {
    // Return false if the directory is not empty
    return success<boolean>(false)
  }
  // Return true if the directory is empty
  return success<boolean>(true)
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

export function isInsideCwd(filePath: string): boolean {
  const cwd = Deno.cwd()
  const relativePath = path.relative(cwd, filePath)
  return relativePath !== ''
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
