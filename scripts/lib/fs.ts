/**
 * TryCatch wrapper for fs operations
 */

import * as fs from 'jsr:@std/fs'
import * as path from 'jsr:@std/path'
import { tryCatch, TryCatchResult, tryCatchSuccess } from './try-catch.ts'

// Re-export fs and path
export { fs, path }

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

export async function saveJson(filePath: string, data: unknown): Promise<TryCatchResult<boolean>> {
  return await tryCatchSuccess(Deno.writeTextFile(filePath, JSON.stringify(data, null, 2)))
}

export async function readJson<T>(filePath: string): Promise<TryCatchResult<T>> {
  return await tryCatch(
    Deno.readTextFile(filePath).then((contents) => JSON.parse(contents) as T),
  )
}
