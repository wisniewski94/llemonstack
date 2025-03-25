/**
 * TryCatch wrapper for fs operations
 */

import * as fs from 'jsr:@std/fs'
import * as path from 'jsr:@std/path'
import * as yaml from 'jsr:@std/yaml'
import { tryCatch, tryCatchBoolean, TryCatchResult } from './try-catch.ts'

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
        data: false,
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
  return await tryCatch(Promise.resolve(Deno.readDir(dirPath)))
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

export async function readJson<T>(filePath: string): Promise<TryCatchResult<T>> {
  return await tryCatch(
    Deno.readTextFile(filePath).then((contents) => JSON.parse(contents) as T),
  )
}

export async function readYaml<T>(filePath: string): Promise<TryCatchResult<T>> {
  return await tryCatch(
    Deno.readTextFile(filePath).then((contents) => yaml.parse(contents) as T),
  )
}
