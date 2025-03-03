#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write
/**
 * Setup required env variables
 *
 * Usage:
 *
 * ```bash
 * deno run setup
 * ```
 */
import { Input, Secret } from '@cliffy/prompt'
import { join } from 'jsr:@std/path'
import {
  generateJWT,
  generateSecretKey,
  supabaseAnonJWTPayload,
  supabaseServiceJWTPayload,
} from './lib/jwt.ts'
import { reset } from './reset.ts'
import {
  confirm,
  DEFAULT_PROJECT_NAME,
  ENVFILE,
  isInitialized,
  LLEMONSTACK_CONFIG_FILE,
  loadEnv,
  showAction,
  showError,
  showInfo,
  start,
  VERSION,
} from './start.ts' // Adjust the path as necessary

async function envFileExists(): Promise<boolean> {
  try {
    await Deno.stat(ENVFILE)
    return true
  } catch (_error) {
    return false
  }
}

async function createConfigFile(): Promise<void> {
  const file = join(Deno.cwd(), LLEMONSTACK_CONFIG_FILE)

  try {
    // Create the .llemonstack directory if it doesn't exist
    await Deno.mkdir('.llemonstack', { recursive: true })

    // Create the config file with initial configuration
    const config = {
      initialized: true,
      timestamp: new Date().toISOString(),
      version: VERSION,
    }
    await Deno.writeTextFile(
      file,
      JSON.stringify(config, null, 2),
    )
  } catch (error) {
    showError(`Error creating config file: ${file}`, error)
  }
}

async function createEnvFile(): Promise<void> {
  if (await envFileExists()) {
    throw new Error('Environment file already exists')
  }
  try {
    await Deno.copyFile('.env.example', ENVFILE)
  } catch (error) {
    throw new Error(`Failed to create .env file: ${error}`)
  }
}

// Check if the value is a valid Docker project name
function projectNameValidator(value?: string): boolean | string {
  if (!/^[a-zA-Z0-9]/.test(value || '')) {
    return 'Name must start with a letter or number'
  }
  if ((value?.length || 0) < 3) {
    return 'Name must be at least 3 characters long'
  }
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]+$/.test(value || '') ||
    'Name can only use letters, numbers, hyphens and underscores'
}

async function updateEnvFile(envVars: Record<string, string>): Promise<void> {
  const envFileContent = await Deno.readTextFile(ENVFILE)
  const updatedEnvFileContent = Object.entries(envVars).reduce((acc, [key, value]) => {
    if (!value) return acc // Keep existing value in .env if key value not set
    return acc.replace(new RegExp(`${key}=.*`, 'g'), `${key}=${value}`)
  }, envFileContent)
  await Deno.writeTextFile(ENVFILE, updatedEnvFileContent)
}

async function setSecurityKeys(envVars: typeof ENVVARS): Promise<Record<string, string>> {
  // Supabase
  const supabaseKey = await generateSecretKey(32)
  envVars.SUPABASE_JWT_SECRET = supabaseKey
  envVars.SUPABASE_ANON_KEY = await generateJWT(supabaseAnonJWTPayload, supabaseKey)
  envVars.SUPABASE_SERVICE_ROLE_KEY = await generateJWT(supabaseServiceJWTPayload, supabaseKey)
  envVars.SUPABASE_VAULT_ENC_KEY = await generateSecretKey(32)
  envVars.POSTGRES_PASSWORD = await generateSecretKey(32)

  // n8n
  envVars.N8N_ENCRYPTION_KEY = await generateSecretKey(32)
  envVars.N8N_USER_MANAGEMENT_JWT_SECRET = await generateSecretKey(32)

  // Zep
  envVars.ZEP_API_SECRET = await generateSecretKey(20)

  // Neo4j
  envVars.NEO4J_PASSWORD = await generateSecretKey(32)

  return envVars
}

const ENVVARS = {
  DOCKER_PROJECT_NAME: '',
  // Supabase
  SUPABASE_DASHBOARD_USERNAME: 'supabase',
  SUPABASE_DASHBOARD_PASSWORD: 'supabase',
  POSTGRES_PASSWORD: '',
  SUPABASE_JWT_SECRET: '',
  SUPABASE_ANON_KEY: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  SUPABASE_VAULT_ENC_KEY: '',
  // N8N
  N8N_ENCRYPTION_KEY: '',
  N8N_USER_MANAGEMENT_JWT_SECRET: '',
  // Zep
  ZEP_API_SECRET: '',
  // Neo4j
  NEO4J_USER: 'neo4j',
  NEO4J_PASSWORD: '',
  // Browser
  BROWSER_USE_VNC_PASSWORD: 'vncpass123',
  // OpenAI
  OPENAI_API_KEY: '',
  // Ollama
  ENABLE_OLLAMA: 'cpu',
}

export async function init(
  projectName: string,
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  force = force || Deno.args.includes('--force') || Deno.args.includes('-f')

  try {
    const initialized = await isInitialized()
    if (initialized) {
      if (!force) {
        showError(`Project already initialized: ${projectName}`)
        if (confirm('Do you want to reset the project to the initial state?')) {
          showAction('Resetting project...')
          // TODO: improve this flow, user should be re-initialize without resetting
          await reset(projectName)
        } else {
          Deno.exit(1)
        }
      }
    }

    showAction('Initializing project...')

    if (await envFileExists()) {
      showInfo('.env file already exists')
      if (confirm('Do you want to delete .env and start fresh?')) {
        await Deno.remove(ENVFILE)
        await createEnvFile()
        showInfo('.env recreated from .env.example')
      } else {
        showInfo('OK, using existing .env file')
      }
    } else {
      showInfo('.env does not exist, copying from .env.example')
      await createEnvFile()
    }
    // Reload .env into Deno.env and show
    await loadEnv({ reload: true, silent: true })

    showInfo('.env file is ready to configure\n')

    const name = await Input.prompt(
      {
        message: 'What is the project name?',
        default: Deno.env.get('DOCKER_PROJECT_NAME') || DEFAULT_PROJECT_NAME,
        hint: 'Used by docker, only letters, numbers, hyphens and underscores',
        transform: (value?: string) => value?.toLowerCase(),
        validate: projectNameValidator,
      },
    )
    projectName = name
    ENVVARS.DOCKER_PROJECT_NAME = name

    // Generate random security keys
    await setSecurityKeys(ENVVARS)

    showAction('\nSetting up passwords...')
    showInfo('Passwords are stored in the .env file and shown to you when you start the stack\n')

    // Prompt user for passwords
    // Supabase
    ENVVARS.SUPABASE_DASHBOARD_PASSWORD = await Secret.prompt({
      message: 'Enter a password for the Supabase dashboard',
      hint: 'This should be a strong password, it grants access to Supabase admin features',
      minLength: 8,
    })
    ENVVARS.BROWSER_USE_VNC_PASSWORD = await Secret.prompt({
      message: 'Enter a password for browser-use VNC',
      hint: 'Used to access the VNC server to watch browser-use automation',
      minLength: 6,
    })

    showAction('\nSetting up required API keys...')
    showInfo(
      'Zep needs a valid OpenAI API key to work properly.\nYou can configure it later if you prefer.\n',
    )

    // Prompt for OpenAI API key
    ENVVARS.OPENAI_API_KEY = await Secret.prompt({
      message: 'Enter the OpenAI API key',
      hint: 'Leave blank to configure later',
    })

    if (!ENVVARS.OPENAI_API_KEY) {
      showInfo(
        '\n❗ Zep will not work properly without an OpenAI key. ' +
          'You can set it in .env or disable Zep later on.',
      )
    }

    // Update .env file with new keys
    await updateEnvFile(ENVVARS)

    showAction('\nProject successfully initialized!\n')

    // Create config file to indicate project is initialized
    await createConfigFile()

    if (confirm('Do you want to start the stack?', true)) {
      await start(projectName)
    } else {
      showInfo('You can start the stack later with `deno run start`')
    }
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  init(Deno.env.get('DOCKER_PROJECT_NAME') || DEFAULT_PROJECT_NAME)
}
