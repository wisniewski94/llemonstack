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
import { Input, Secret, Select } from '@cliffy/prompt'
import { loadEnv } from './lib/env.ts'
import {
  generateJWT,
  generateRandomBase64,
  generateSecretKey,
  generateUUID,
  supabaseAnonJWTPayload,
  supabaseServiceJWTPayload,
} from './lib/jwt.ts'
import { createServiceSchema, isPostgresConnectionValid } from './lib/postgres.ts'
import { reset } from './reset.ts'
import {
  checkPrerequisites,
  confirm,
  DEFAULT_PROJECT_NAME,
  ENVFILE,
  getOS,
  isInitialized,
  isSupabaseStarted,
  LLEMONSTACK_CONFIG_DIR,
  LLEMONSTACK_CONFIG_FILE,
  prepareEnv,
  setupRepos,
  showAction,
  showError,
  showHeader,
  showInfo,
  showService,
  showUserAction,
  showWarning,
  startService,
  VERSION,
} from './start.ts' // Adjust the path as necessary

// Env var key names we care about
type EnvVarsKeys = keyof {
  DOCKER_PROJECT_NAME: string
  // Supabase
  SUPABASE_DASHBOARD_USERNAME: string
  SUPABASE_DASHBOARD_PASSWORD: string
  POSTGRES_PASSWORD: string
  SUPABASE_JWT_SECRET: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  SUPABASE_VAULT_ENC_KEY: string
  // N8N
  N8N_ENCRYPTION_KEY: string
  N8N_USER_MANAGEMENT_JWT_SECRET: string
  // Flowise
  FLOWISE_PASSWORD: string
  // Zep
  ZEP_API_SECRET: string
  // Neo4j
  NEO4J_USER: string
  NEO4J_PASSWORD: string
  // Browser
  BROWSER_USE_VNC_PASSWORD: string
  // OpenAI
  OPENAI_API_KEY: string
  // Ollama
  ENABLE_OLLAMA: string
  // LiteLLM
  LITELLM_MASTER_KEY: string
  LITELLM_UI_PASSWORD: string
  LITELLM_SALT_KEY: string
  // Langfuse
  LANGFUSE_SALT: string // 32
  LANGFUSE_ENCRYPTION_KEY: string // 64
  LANGFUSE_NEXTAUTH_SECRET: string // 32
  LANGFUSE_INIT_PROJECT_PUBLIC_KEY: string
  LANGFUSE_INIT_PROJECT_SECRET_KEY: string
  LANGFUSE_INIT_USER_PASSWORD: string
  // Minio
  MINIO_ROOT_PASSWORD: string
  // Clickhouse
  CLICKHOUSE_PASSWORD: string
  // Redis
  REDIS_PASSWORD: string
}

interface PostgresServiceEnvKeys {
  user: string
  pass: string
  schema?: string
  custom?: Record<string, string>
}

// Type for environment variables
type PostgresEnvVarKeys =
  | typeof POSTGRES_SERVICES[number][1]['user']
  | typeof POSTGRES_SERVICES[number][1]['pass']
  | (typeof POSTGRES_SERVICES[number][1]['schema'] & string)

// Combined type for all environment variables
type AllEnvVarKeys = EnvVarsKeys | PostgresEnvVarKeys

// Services that support custom postgres user and password
const POSTGRES_SERVICES: Array<[string, PostgresServiceEnvKeys]> = [
  ['litellm', {
    user: 'LITELLM_POSTGRES_USER',
    pass: 'LITELLM_POSTGRES_PASSWORD',
    schema: 'LITELLM_POSTGRES_SCHEMA',
  }],
  ['flowise', { user: 'FLOWISE_POSTGRES_USER', pass: 'FLOWISE_POSTGRES_PASSWORD' }],
  ['langfuse', {
    user: 'LANGFUSE_POSTGRES_USER',
    pass: 'LANGFUSE_POSTGRES_PASSWORD',
    schema: 'LANGFUSE_POSTGRES_SCHEMA',
  }],
  ['zep', {
    user: 'ZEP_POSTGRES_USER',
    pass: 'ZEP_POSTGRES_PASSWORD',
    schema: 'ZEP_POSTGRES_SCHEMA',
  }],
  // n8n doesn't need a separate postgres user and password and requires root access.
  // Most likely schema:create does not grant enough permissions to n8n to use a separate user and password.
  // ['n8n', {
  //   user: 'N8N_POSTGRES_USER',
  //   pass: 'N8N_POSTGRES_PASSWORD',
  //   schema: 'N8N_POSTGRES_SCHEMA',
  // }],
]

async function envFileExists(): Promise<boolean> {
  try {
    await Deno.stat(ENVFILE)
    return true
  } catch (_error) {
    return false
  }
}

async function createConfigFile(): Promise<void> {
  // Check if the config directory exists
  try {
    await Deno.stat(LLEMONSTACK_CONFIG_DIR)
  } catch (_error) {
    // Create the config directory if it doesn't exist
    await Deno.mkdir(LLEMONSTACK_CONFIG_DIR, { recursive: true })
  }
  try {
    // Create the config file with initial configuration
    const config = {
      initialized: true,
      timestamp: new Date().toISOString(),
      version: VERSION,
    }
    await Deno.writeTextFile(
      LLEMONSTACK_CONFIG_FILE,
      JSON.stringify(config, null, 2),
    )
  } catch (error) {
    showError(`Error creating config file: ${LLEMONSTACK_CONFIG_FILE}`, error)
  }
}

export async function clearConfigFile(): Promise<void> {
  try {
    await Deno.stat(LLEMONSTACK_CONFIG_FILE)
    await Deno.remove(LLEMONSTACK_CONFIG_FILE)
  } catch (_error) {
    // File doesn't exist, do nothing
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

export async function clearEnvFile(): Promise<void> {
  if (await envFileExists()) {
    await Deno.remove(ENVFILE)
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

async function updateEnvFile(
  envVars: Record<AllEnvVarKeys, string>,
): Promise<Record<string, string>> {
  const envFileContent = await Deno.readTextFile(ENVFILE)
  const updatedEnvFileContent = Object.entries(envVars).reduce((acc, [key, value]) => {
    if (!value) return acc // Keep existing value in .env if key value not set
    const tmp = acc.replace(new RegExp(`${key}=.*`, 'g'), `${key}=${value}`)
    // If the key is not found in the .env file, add it to the end of the file
    if (tmp === acc && !acc.includes(`${key}=${value}`)) {
      showWarning(`${key} not found in .env file, adding to end of file`)
      return `${acc}\n${key}=${value}\n`
    }
    return tmp
  }, envFileContent)
  await Deno.writeTextFile(ENVFILE, updatedEnvFileContent)
  return await loadEnv({ reload: true, expand: false })
}

/**
 * Set security keys for the project if not set
 * @param envVars - The environment variables to set
 * @returns The updated environment variables
 */
async function setSecurityKeys(
  envVars: Record<AllEnvVarKeys, string>,
): Promise<Record<AllEnvVarKeys, string>> {
  // Supabase
  const supabaseKey = envVars.SUPABASE_JWT_SECRET || await generateSecretKey(32)
  envVars.SUPABASE_JWT_SECRET = supabaseKey
  envVars.SUPABASE_ANON_KEY = envVars.SUPABASE_ANON_KEY ||
    await generateJWT(supabaseAnonJWTPayload, supabaseKey)
  envVars.SUPABASE_SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY ||
    await generateJWT(supabaseServiceJWTPayload, supabaseKey)
  envVars.SUPABASE_VAULT_ENC_KEY = envVars.SUPABASE_VAULT_ENC_KEY || await generateSecretKey(32)
  envVars.POSTGRES_PASSWORD = envVars.POSTGRES_PASSWORD || await generateSecretKey(32)

  // n8n
  envVars.N8N_ENCRYPTION_KEY = envVars.N8N_ENCRYPTION_KEY || await generateSecretKey(32)
  envVars.N8N_USER_MANAGEMENT_JWT_SECRET = envVars.N8N_USER_MANAGEMENT_JWT_SECRET ||
    await generateSecretKey(32)

  // Zep
  envVars.ZEP_API_SECRET = envVars.ZEP_API_SECRET || await generateSecretKey(20)

  // Flowise
  envVars.FLOWISE_PASSWORD = envVars.FLOWISE_PASSWORD || await generateSecretKey(22)

  // Neo4j
  envVars.NEO4J_PASSWORD = envVars.NEO4J_PASSWORD || await generateSecretKey(32)

  // LiteLLM
  envVars.LITELLM_MASTER_KEY = envVars.LITELLM_MASTER_KEY || `sk-${await generateSecretKey(32)}`
  envVars.LITELLM_UI_PASSWORD = envVars.LITELLM_UI_PASSWORD || await generateSecretKey(16)
  envVars.LITELLM_SALT_KEY = envVars.LITELLM_SALT_KEY || await generateRandomBase64(32)

  // Langfuse
  envVars.LANGFUSE_SALT = envVars.LANGFUSE_SALT || await generateRandomBase64(32)
  envVars.LANGFUSE_ENCRYPTION_KEY = envVars.LANGFUSE_ENCRYPTION_KEY || await generateSecretKey(64)
  envVars.LANGFUSE_NEXTAUTH_SECRET = envVars.LANGFUSE_NEXTAUTH_SECRET ||
    await generateRandomBase64(32)
  envVars.LANGFUSE_INIT_PROJECT_PUBLIC_KEY = envVars.LANGFUSE_INIT_PROJECT_PUBLIC_KEY ||
    `pk-lf-${generateUUID()}`
  envVars.LANGFUSE_INIT_PROJECT_SECRET_KEY = envVars.LANGFUSE_INIT_PROJECT_SECRET_KEY ||
    `sk-lf-${generateUUID()}`
  envVars.LANGFUSE_INIT_USER_PASSWORD = envVars.LANGFUSE_INIT_USER_PASSWORD ||
    await generateSecretKey(22)
  // Minio
  envVars.MINIO_ROOT_PASSWORD = envVars.MINIO_ROOT_PASSWORD || await generateSecretKey(22)
  // Clickhouse
  envVars.CLICKHOUSE_PASSWORD = envVars.CLICKHOUSE_PASSWORD || await generateSecretKey(22)
  // Redis
  envVars.REDIS_PASSWORD = envVars.REDIS_PASSWORD || await generateSecretKey(22)

  return envVars
}

/**
 * Replace any password that equals POSTGRES_PASSWORD with ${POSTGRES_PASSWORD} placeholder
 * @param envVars - The environment variables to update
 * @param pgPass - The postgres password
 */
function replacePostgresPasswords(
  envVars: Record<string, string>,
  pgPass: string,
): Record<string, string> {
  for (const key in envVars) {
    if (key !== 'POSTGRES_PASSWORD' && envVars[key] === pgPass) {
      envVars[key as keyof typeof envVars] = '${POSTGRES_PASSWORD}'
    }
  }
  return envVars
}

/**
 * Prompt user for ollama configuration options
 * @returns The selected ollama profile
 */
async function configOllama(): Promise<string> {
  const gpuDisabled = getOS() === 'macos'
  if (gpuDisabled) {
    showWarning('GPU options are not currently available on macOS due to Docker limitations.\n')
  }

  const gpuMessage = gpuDisabled ? ' (not available on macOS)' : ''
  const ollamaProfile: string = await Select.prompt({
    message: 'How do you want to run Ollama?',
    options: [
      Select.separator('----- Run on Host 🖥️ -----'),
      {
        name: '[HOST] Creates a network bridge',
        value: 'host',
      },
      { name: '[NONE] Disable Ollama service', value: 'false' },
      Select.separator('----- Run in Docker Container 🐳 -----'),
      { name: '[CPU] Run on CPU, slow but compatible', value: 'cpu' },
      {
        name: `[AMD] Run on AMD GPU ${gpuMessage} `,
        value: 'gpu-amd',
        disabled: gpuDisabled,
      },
      {
        name: `[NVIDIA] Run on Nvidia GPU ${gpuMessage}`,
        value: 'gpu-nvidia',
        disabled: gpuDisabled,
      },
    ],
  })
  return ollamaProfile
}

async function startSupabase(
  projectName: string,
  envVars: Record<AllEnvVarKeys, string>,
): Promise<void> {
  // Make sure supabase is running
  if (!await isSupabaseStarted(projectName)) {
    try {
      // Start supabase
      showInfo('Starting Supabase...')
      await startService(projectName, 'supabase')
      // Wait for 3 seconds to ensure Supabase is fully initialized
      await new Promise((resolve) => setTimeout(resolve, 3000))
    } catch (error) {
      showError('Supabase failed to start', error)
    }
  }
  // Check postgres connection
  if (await isPostgresConnectionValid({ password: envVars.POSTGRES_PASSWORD })) {
    showInfo('Successfully connected to Supabase postgres')
  } else {
    showInfo('Attempting to start Supabase again...')
    try {
      await startService(projectName, 'supabase')
      await new Promise((resolve) => setTimeout(resolve, 5000))
    } catch (error) {
      showError('Error while starting Supabase', error)
    }
    if (!await isPostgresConnectionValid({ password: envVars.POSTGRES_PASSWORD })) {
      showError('Failed to start Supabase again, unable to continue')
      Deno.exit(1)
    }
  }
}

/**
 * Create postgres schemas for all services that use postgres
 * @returns The updated environment variables
 */
async function createServiceSchemas(): Promise<Record<AllEnvVarKeys, string>> {
  const dbPassword = Deno.env.get('POSTGRES_PASSWORD') ?? ''
  if (!dbPassword) {
    showError('POSTGRES_PASSWORD is not set in .env file, unable to create postgres schemas')
    Deno.exit(1)
  }
  const dbVars: Record<string, string> = {}
  for (const service of POSTGRES_SERVICES) {
    showInfo(`Creating schema for ${service[0]}...`)
    const credentials = await createServiceSchema(service[0], {
      password: dbPassword,
    })
    dbVars[service[1].user] = credentials.username
    dbVars[service[1].pass] = credentials.password
    service[1].schema && (dbVars[service[1].schema] = credentials.schema)
    if (service[1].custom) {
      for (const [key, value] of Object.entries(service[1].custom)) {
        dbVars[key] = value
      }
    }
    showInfo(`Schema created for ${service[0]}: ${credentials.schema}`)
  }
  // Save db vars to .env file
  // Replace any password that equals POSTGRES_PASSWORD with ${POSTGRES_PASSWORD} placeholder
  return await updateEnvFile(replacePostgresPasswords(dbVars, dbPassword))
}

export async function init(
  projectName: string,
): Promise<void> {
  try {
    showAction('Checking prerequisites...')
    await checkPrerequisites()
    showInfo('Prerequisites met')
  } catch (error) {
    showError(
      'Prerequisites not met, please install the required dependencies and try again.',
      error,
    )
    Deno.exit(1)
  }

  // TODO: check if required host ports are available.
  // Script will fail if another LLemonStack, Supabase, etc. is already running on the required ports.

  try {
    if (await isInitialized()) {
      showWarning(`Project already initialized: ${projectName}`)
      const resetOption: string = await Select.prompt({
        message: 'How do you want to proceed?',
        options: [
          {
            name: '💣 [Hard Reset] delete all containers & volumes (data) and start over',
            value: 'hard-reset',
          },
          {
            name: '⌫ [Config Reset] start with a fresh .env file',
            value: 'config-reset',
          },
          {
            name: '↩ [Reinitialize] keep existing .env file and rerun the config setup',
            value: 'reinitialize',
          },
          {
            name: '↩ [Cancel]',
            value: 'none',
          },
        ],
      })
      if (resetOption === 'hard-reset') {
        if (confirm('Are you sure you want to delete all data and start over?')) {
          showAction('Resetting project...')
          await reset(projectName, { skipPrompt: true, skipCache: true })
          await clearEnvFile()
          await clearConfigFile()
        } else {
          Deno.exit(1)
        }
      } else if (resetOption === 'config-reset') {
        await clearEnvFile()
        await clearConfigFile()
      } else if (resetOption === 'reinitialize') {
        await clearConfigFile()
      }
    }

    showHeader('Initializing project...')

    if (await envFileExists()) {
      showInfo('.env file already exists')
      if (confirm('Do you want to delete .env and start fresh?', false)) {
        await clearEnvFile()
        await createEnvFile()
        showInfo('.env recreated from .env.example')
      } else {
        showInfo('OK, using existing .env file')
      }
    } else {
      showInfo('.env does not exist, copying from .env.example')
      await createEnvFile()
    }

    // Get env vars and populate Deno.env
    let envVars = await loadEnv({ reload: true, expand: false })

    showInfo('.env file is ready to configure\n')

    showAction('\nSetting up service repositories...')
    await setupRepos({ all: true })
    showInfo('Repositories ready\n\n')

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
    envVars.DOCKER_PROJECT_NAME = name

    // Generate random security keys
    envVars = await setSecurityKeys(envVars)

    showAction('\nSetting up passwords...')
    showInfo('Passwords are stored in the .env file and shown to you when you start the stack\n')

    // Prompt user for passwords
    // Supabase
    envVars.SUPABASE_DASHBOARD_PASSWORD = await Secret.prompt({
      message: 'Enter a password for the Supabase dashboard',
      hint: 'Grants admin access. Press enter to generate a random password',
      minLength: 8,
      hideDefault: true,
      default: envVars.SUPABASE_DASHBOARD_PASSWORD || await generateSecretKey(16),
    })

    // Browser VNC
    envVars.BROWSER_USE_VNC_PASSWORD = await Secret.prompt({
      message: 'Enter a password for browser-use VNC',
      hint: 'Used to watch browser-use automation. Press enter to generate a random password',
      minLength: 6,
      hideDefault: true,
      default: envVars.BROWSER_USE_VNC_PASSWORD || await generateSecretKey(12),
    })

    // Prompt for OpenAI API key
    showAction('\nConfigure optional LLM API keys...')
    envVars.OPENAI_API_KEY = await Secret.prompt({
      message: 'Enter the OpenAI API key',
      hint: 'Leave blank to configure later',
      default: envVars.OPENAI_API_KEY,
      hideDefault: true,
    })

    showHeader('Ollama Configuration Options')
    showInfo('Ollama can run on your host machine or inside a Docker container.')
    showInfo('The host option requires manually starting ollama on your host machine.')
    showInfo('If running in Docker, you can choose to run it on the CPU (slow) or a GPU (fast).')
    showInfo("GPU options require a compatible GPU on the host... because it's not magic.\n")

    const ollamaProfile = await configOllama()
    envVars.ENABLE_OLLAMA = ollamaProfile

    // Checkpoint, save env vars to .env file
    envVars = await updateEnvFile(envVars)

    // Setup supabase env
    await prepareEnv()

    showAction('\nSetting up postgres schemas...')
    showInfo('This will create a postgres user and schema for each service that supports schemas.')
    await startSupabase(projectName, envVars)
    await createServiceSchemas()
    showInfo('Postgres schemas successfully created')

    showAction('\nProject successfully initialized!\n')
    showInfo('Config values saved to .env file')

    // Create config file to indicate project is initialized
    await createConfigFile()

    if (ollamaProfile === 'host') {
      showInfo('\nOllama host option requires Ollama running on your host machine.')
      showService('Download Ollama', 'https://ollama.com/docs/installation')
      showUserAction('Run `ollama run` on your host machine to start the service\n')
    }
    showUserAction('Start the stack with `deno run start`')
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  init(Deno.env.get('DOCKER_PROJECT_NAME') || DEFAULT_PROJECT_NAME)
}
