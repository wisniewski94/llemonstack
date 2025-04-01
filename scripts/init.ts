/**
 * Setup required env variables
 */
import { runDockerCommand } from '@/lib/docker.ts'
import { fileExists, path } from '@/lib/fs.ts'
import {
  generateJWT,
  generateRandomBase64,
  generateSecretKey,
  generateUUID,
  supabaseAnonJWTPayload,
  supabaseServiceJWTPayload,
} from '@/lib/jwt.ts'
import {
  confirm,
  showAction,
  showError,
  showHeader,
  showInfo,
  showService,
  showUserAction,
  showWarning,
} from '@/lib/logger.ts'
import { createServiceSchema, isPostgresConnectionValid } from '@/lib/postgres.ts'
import { OllamaService } from '@/services/ollama/service.ts'
import { Input, Secret, Select } from '@cliffy/prompt'
import { Config } from '../src/core/config/config.ts'
import { configure } from './configure.ts'
import { reset } from './reset.ts'
import { checkPrerequisites, startService } from './start.ts' // Adjust the path as necessary

// Env var key names we care about
type EnvVarsKeys = keyof {
  LLEMONSTACK_PROJECT_NAME: string
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
  // Local LLM
  LOCAL_LLM_OPENAI_API_BASE_URL: string
  LOCAL_LLM_OPENAI_HOST_PORT: string
  LOCAL_LLM_OPENAI_API_KEY: string
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
  // Most likely schema:create does not currently grant enough permissions on the extensions schema .
  // n8n uses the primary postgres user and password and auto creates the service_n8n schema.
  // ['n8n', {
  //   user: 'N8N_POSTGRES_USER',
  //   pass: 'N8N_POSTGRES_PASSWORD',
  //   schema: 'N8N_POSTGRES_SCHEMA',
  // }],
]

async function envFileExists(config: Config): Promise<boolean> {
  return (await fileExists(config.envFile)).success
}

// async function createConfigFile(config: Config): Promise<void> {
//   // Check if the config directory exists
//   if (!(await fileExists(config.configDir)).success) {
//     // Create the config directory if it doesn't exist
//     await Deno.mkdir(config.configDir, { recursive: true })
//   }
//   try {
//     await Deno.writeTextFile(
//       CONFIG.configFile,
//       JSON.stringify(config, null, 2),
//     )
//   } catch (error) {
//     showError(`Error creating config file: ${CONFIG.configFile}`, error)
//   }
// }

export async function clearConfigFile(config: Config): Promise<void> {
  try {
    await Deno.stat(config.configFile)
    await Deno.remove(config.configFile)
  } catch (_error) {
    // File doesn't exist, do nothing
  }
}

async function createEnvFile(config: Config): Promise<void> {
  if (await envFileExists(config)) {
    throw new Error('Environment file already exists')
  }
  try {
    await Deno.copyFile(path.join(config.installDir, '.env.example'), config.envFile)
  } catch (error) {
    throw new Error(`Failed to create .env file: ${error}`)
  }
}

export async function clearEnvFile(config: Config): Promise<void> {
  if (await envFileExists(config)) {
    await Deno.remove(config.envFile)
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

async function startSupabase(
  config: Config,
  envVars: Record<AllEnvVarKeys, string>,
): Promise<void> {
  const supabase = config.getServiceByName('supabase')

  if (!supabase) {
    showError('Supabase service not found')
    Deno.exit(1)
  }

  // Make sure supabase is running
  // TODO: get supabase service and and call isRunning
  // isSupabaseStarted was originally exported by start.ts
  if (!await supabase.isRunning()) {
    try {
      // Start supabase
      showInfo('Starting Supabase...')
      await supabase.start()
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
      await startService(config, 'supabase')
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
async function createServiceSchemas(config: Config): Promise<Record<AllEnvVarKeys, string>> {
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
  const results = await config.updateEnvFile(replacePostgresPasswords(dbVars, dbPassword), {
    reload: true,
    expand: false,
  })
  if (!results.success) {
    showError(results.error)
    Deno.exit(1)
  }
  return results.data ?? {}
}

/**
 * Check if a project with the same project name is already running
 * @param projectName - The name of the project to check
 * @returns True if the project exists, false otherwise
 */
async function isExistingProject(projectName: string): Promise<boolean> {
  try {
    // Check if any project has the given name
    // This will only find projects that are running or haven't been fully stopped.
    const projects = (await runDockerCommand('compose', {
      args: ['ls', '--format', 'json'],
      captureOutput: true,
      silent: true,
    })).toJson() as Array<{ Name: string }>
    return projects.some((project) => project.Name.toLowerCase() === projectName.toLowerCase())
  } catch (error) {
    // If command fails, log the error but don't fail the initialization
    showError('Failed to check if project exists', error)
    return false
  }
}

export async function init(
  config: Config,
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
    if (config.isProjectInitialized()) {
      showWarning(`Project already initialized: ${config.projectName}`)
      const resetOption: string = await Select.prompt({
        message: 'How do you want to proceed?',
        options: [
          {
            name: '[Reinitialize] keep existing .env file and rerun the config setup',
            value: 'reinitialize',
          },
          {
            name: '[Config Reset] start with a fresh .env file',
            value: 'config-reset',
          },
          {
            name: '[Hard Reset] delete all containers & volumes (data) and start over',
            value: 'hard-reset',
          },
          {
            name: '[Cancel]',
            value: 'none',
          },
        ],
      })
      if (resetOption === 'none') {
        showInfo('OK, exiting...')
        Deno.exit(0)
      }
      if (resetOption === 'hard-reset') {
        if (confirm('Are you sure you want to delete all data and start over?')) {
          showAction('Resetting project...')
          await reset(config, { skipPrompt: true, skipCache: true })
          await clearEnvFile(config)
          await clearConfigFile(config)
        } else {
          showInfo('OK, exiting...')
          Deno.exit(1)
        }
      } else if (resetOption === 'config-reset') {
        showInfo('Replacing .env file with a fresh copy from .env.example')
        await clearEnvFile(config)
        await clearConfigFile(config)
      } else if (resetOption === 'reinitialize') {
        showInfo('Using existing config data from .env file')
        await clearConfigFile(config)
      }
    }

    showHeader('Initializing project...')

    if (await envFileExists(config)) {
      showInfo('.env file already exists')
      if (confirm('Do you want to delete .env and start fresh?', false)) {
        await clearEnvFile(config)
        await createEnvFile(config)
        showInfo('.env recreated from .env.example')
      } else {
        showInfo('OK, using existing .env file')
      }
    } else {
      showInfo('.env does not exist, copying from .env.example')
      await createEnvFile(config)
    }

    // Create a copy of env vars to modify
    let envVars = { ...config.env }

    showInfo('.env file is ready to configure')

    let uniqueName = false
    let projectName = ''
    while (!uniqueName) {
      projectName = await Input.prompt({
        message: 'What is the project name?',
        default: Config.defaultProjectName,
        hint: 'Used by docker, only letters, numbers, hyphens and underscores',
        transform: (value?: string) => value?.toLowerCase(),
        validate: projectNameValidator,
      })

      // TODO: move existing project check to config
      uniqueName = !(await isExistingProject(projectName))

      if (!uniqueName) {
        showWarning(`This project name is already in use: ${projectName}`)
        showInfo(
          `Projects with the same name will reuse some of the same Docker containers.\n` +
            `This can result in unexpected behavior. It's safest to choose a unique name.`,
        )
        if (confirm('Do you want to choose a different name?', true)) {
          continue
        } else {
          showInfo(`OK, proceeding with the duplicate name: ${projectName}`)
          break
        }
      }
    }

    const result = await config.setProjectName(projectName)
    if (!result.success) {
      showError(result.error)
      Deno.exit(1)
    }

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

    // TODO: call configure on ollama service class
    const ollamaService = config.getServiceByName('ollama') as OllamaService
    if (ollamaService) {
      await ollamaService.configure({ silent: false, config })
    }
    // const ollamaProfile = await configOllama()

    // Run the config at this point?
    await configure(config)

    // envVars.ENABLE_OLLAMA = ollamaProfile

    // Checkpoint, save env vars to .env file
    // TODO: move to config
    const _result = await config.updateEnvFile(envVars, {
      reload: true,
      expand: false, // Preserve KEY=${POSTGRES_PASSWORD} format during the init process
    })

    // Setup supabase env
    await config.prepareEnv()

    showAction('\nSetting up postgres schemas...')
    showInfo('This will create a postgres user and schema for each service that supports schemas.')
    await startSupabase(config, envVars)
    await createServiceSchemas(config)
    showInfo('Postgres schemas successfully created')

    showAction('\nProject successfully initialized!\n')
    showInfo('Config values saved to .env file')

    // Create config file to indicate project is initialized
    // TODO: double check config is already creating the file, then remove this
    // await createConfigFile(config)

    if (ollamaService?.useHostOllama()) {
      showInfo('\nOllama host option requires Ollama running on your host machine.')
      showService('Download Ollama', 'https://ollama.com/docs/installation')
      showUserAction('Run `ollama run` on your host machine to start the service\n')
    }
    showUserAction('Start the stack with `llmn start`')
  } catch (error) {
    showError(error)
    Deno.exit(1)
  }
}
