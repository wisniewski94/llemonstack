/**
 * Setup required env variables
 */
import { runDockerCommand } from '@/lib/docker.ts'
import { fileExists, path } from '@/lib/fs.ts'
import { Input, Secret, Select } from '@cliffy/prompt'
import { Config } from '../src/core/config/config.ts'
import { reset } from './reset.ts'
import { stop } from './stop.ts'

async function envFileExists(config: Config): Promise<boolean> {
  return (await fileExists(config.envFile)).data ?? false
}

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
    await config.loadEnv({ reload: true, expand: true, skipServices: true })
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
    console.error('Failed to check if project exists:', error)
    return false
  }
}

async function initService(config: Config, serviceName: string): Promise<void> {
  const show = config.relayer.show

  const service = config.getServiceByName(serviceName)
  if (!service) {
    show.fatal(`Service ${serviceName} not found`)
  }

  show.action(`Initializing ${service!.name}...`)

  const results = await service!.init()

  show.logMessages(results.messages)
  if (!results.success) {
    show.fatal('Failed to initialize service', { error: results.error })
  }
}

export async function init(
  config: Config,
  service?: string,
): Promise<void> {
  const show = config.relayer.show

  try {
    await config.checkPrerequisites()
  } catch (error) {
    show.fatal(
      'Prerequisites not met, please install the required dependencies and try again.',
      { error },
    )
  }

  // TODO: check if required host ports are available.
  // Script will fail if another LLemonStack, Supabase, etc. is already running on the required ports.

  try {
    let keepEnv = false

    if (config.isProjectInitialized()) {
      // Handle single service initialization
      if (service) {
        await initService(config, service)
        Deno.exit(0)
      }

      show.warn(`Project already initialized: ${config.projectName}`)
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
        show.info('OK, exiting...')
        Deno.exit(0)
      }
      if (resetOption === 'hard-reset') {
        if (show.confirm('Are you sure you want to delete all data and start over?')) {
          show.action('Resetting project...')
          await reset(config, { skipPrompt: true, skipCache: true })
          await clearEnvFile(config)
          await clearConfigFile(config)
        } else {
          show.info('OK, exiting...')
          Deno.exit(1)
        }
      } else if (resetOption === 'config-reset') {
        show.info('Replacing .env file with a fresh copy from .env.example')
        await clearEnvFile(config)
        await clearConfigFile(config)
      } else if (resetOption === 'reinitialize') {
        show.info('Using existing config data from .env file')
        await clearConfigFile(config)
        keepEnv = true
      }
    }

    // Check if .env file exists
    const envExists = await envFileExists(config)
    if (!envExists) {
      show.info('.env does not exist, copying from .env.example')
      await createEnvFile(config)
    } else if (!keepEnv) {
      show.info('.env file already exists')
      if (show.confirm('Do you want to delete .env and start fresh?', false)) {
        // Double confirm with user as this will delete all existing env vars
        show.warn(
          'Deleting .env could cause issues with services that already populated a database.',
        )
        if (show.confirm('Are you sure you want to delete the .env file?', false)) {
          await clearEnvFile(config)
          await createEnvFile(config)
          show.info('.env recreated from .env.example')
        } else {
          show.info('OK, using existing .env file')
        }
      } else {
        show.info('OK, using existing .env file')
      }
    }

    show.info('.env file is ready to configure')

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

      show.info(`Checking if project name is unique: ${projectName}`)

      // TODO: move existing project check to config
      uniqueName = !(await isExistingProject(projectName))

      if (!uniqueName) {
        show.warn(`This project name is already in use: ${projectName}`)
        show.info(
          `Projects with the same name will reuse some of the same Docker containers.\n` +
            `This can result in unexpected behavior. It's safest to choose a unique name.`,
        )
        if (show.confirm('Do you want to choose a different name?', true)) {
          continue
        } else {
          show.info(`OK, proceeding with the duplicate name: ${projectName}`)
          break
        }
      }
    }

    // Set project name & initialize
    // Initialize will save the config file
    await config.setProjectName(projectName, { save: false })
    const result = await config.initializeProject()

    if (!result.success) {
      show.fatal('Failed to set project name', { error: result.error })
    }

    // Initialize services by service group
    // This ensures any services that need to start dependencies are started first
    for (const [groupName, groupServices] of config.getServicesGroups()) {
      if (groupServices.size > 0) {
        show.action(`\nInitializing ${groupName} services...`)
        for (const [_, service] of groupServices) {
          show.info(`Initializing ${service.name}...`)
          const results = await service.init()
          show.logMessages(results.messages)
          // At this stage, services env vars are not loaded yet
          // Any service that needs env vars of another service during init will not work properly
        }
      }
    }

    // Load env vars for all enabled services
    await config.loadEnv({ reload: true, expand: true, skipServices: false })

    const envVars: Record<string, string> = {}

    // Prompt for OpenAI API key
    show.action('\nConfigure optional LLM API keys...')
    envVars.OPENAI_API_KEY = await Secret.prompt({
      message: 'Enter the OpenAI API key',
      hint: 'Leave blank to configure later',
      default: envVars.OPENAI_API_KEY,
      hideDefault: true,
    })

    // Update .env file with the new env vars
    const envResult = await config.setEnvFileVars(envVars)
    show.logMessages(envResult.messages)
    if (!envResult.success) {
      show.fatal('Failed to update .env file', { error: envResult.error })
    }

    // Stop any services that were started during the initialization process
    await stop(config, { all: true })

    show.action('\n✅ Initialization complete!')
    show.userAction('Start the stack with `llmn start` or configure services with `llmn config`')
  } catch (error) {
    show.fatal('Initialization failed', { error })
  }
}
