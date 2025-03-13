/**
 * Utils for parsing .env files
 *
 * Deno's dotenv auto expands env variables with no ability to turn off expansion.
 * The functions in this file allow for processing .env files without expansion.
 *
 * See mod.ts and parse.ts from 'jsr:@std/dotenv'
 */

import { load as loadDotEnv } from 'jsr:@std/dotenv'

/**
 * Load the .env file
 *
 * If reload is false, Deno.env values will not be updated for any
 * values that were previously set. This protects against .env values
 * overwriting any values set in the command line when the script is run.
 *
 * If reload is true, all values in .env file will replace Deno.env
 * values even if they're blank in .env and already set in Deno.env.
 *
 * If expand is false, env values will be returned as is and not expanded.
 * e.g. KEY=${SOME_OTHER_KEY} will be preserved when expand is false.
 * When expand is true, KEY's value will be expanded to the value of SOME_OTHER_KEY.
 *
 * @param {Object} options - The options for loading the .env file
 * @param {string} options.envPath - The path to the .env file
 * @param {boolean} options.reload - Whether to reload the .env file
 * @param {boolean} options.expand - Whether to expand values in the .env file
 * @returns {Promise<Record<string, string>>} The environment variables
 */
export async function loadEnv(
  { envPath = '.env', reload = false, expand = true }: {
    envPath?: string
    reload?: boolean
    expand?: boolean
  } = {},
): Promise<Record<string, string>> {
  // Use deno's built-in env loader if expand is true, otherwise use the custom loader
  const loadFunc = expand ? loadDotEnv : loadWithoutExpand
  let envValues = {} as Record<string, string>
  if (!reload) {
    envValues = await loadFunc({ envPath, export: true })
  } else { // reload is true
    envValues = await loadFunc({
      envPath,
      export: false, // Don't automatically export to Deno.env
    })
    // Set each variable in Deno.env even if already set
    // loadDonEnv({ export: true }) will only set variables if undefined in Deno.env
    // The reload flag sets all variables even if they are already set in Deno.env
    for (const [key, value] of Object.entries(envValues)) {
      Deno.env.set(key, value)
    }
  }
  return envValues
}

//
// Copied from mod.ts and parse.ts in 'jsr:@std/dotenv'
//

type LineParseResult = {
  key: string
  unquoted: string
  interpolated: string
  notInterpolated: string
}

interface LoadOptions {
  envPath?: string | null
  export?: boolean
}

type CharactersMap = { [key: string]: string }

const RE_KEY_VALUE =
  /^\s*(?:export\s+)?(?<key>[^\s=#]+?)\s*=[\ \t]*('\r?\n?(?<notInterpolated>(.|\r\n|\n)*?)\r?\n?'|"\r?\n?(?<interpolated>(.|\r\n|\n)*?)\r?\n?"|(?<unquoted>[^\r\n#]*)) *#*.*$/gm

const RE_VALID_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/

async function loadWithoutExpand(
  options: LoadOptions = {},
): Promise<Record<string, string>> {
  const {
    envPath = '.env',
    export: _export = false,
  } = options
  const conf = envPath ? await parseWithoutExpand(await Deno.readTextFile(envPath)) : {}
  if (_export) {
    for (const [key, value] of Object.entries(conf)) {
      if (Deno.env.get(key) !== undefined) continue
      Deno.env.set(key, value)
    }
  }
  return conf
}

function expandCharacters(str: string): string {
  const charactersMap: CharactersMap = {
    '\\n': '\n',
    '\\r': '\r',
    '\\t': '\t',
  }
  return str.replace(
    /\\([nrt])/g,
    ($1: keyof CharactersMap): string => charactersMap[$1] ?? '',
  )
}

export function parseWithoutExpand(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  let match

  while ((match = RE_KEY_VALUE.exec(text)) !== null) {
    const { key, interpolated, notInterpolated, unquoted } = match
      ?.groups as LineParseResult
    if (!RE_VALID_KEY.test(key)) {
      console.warn(
        `Ignored the key "${key}" as it is not a valid identifier: The key need to match the pattern /^[a-zA-Z_][a-zA-Z0-9_]*$/.`,
      )
      continue
    }

    env[key] = typeof notInterpolated === 'string'
      ? notInterpolated
      : typeof interpolated === 'string'
      ? expandCharacters(interpolated)
      : unquoted.trim()
  }

  return env
}
