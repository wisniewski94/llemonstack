#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write --allow-net

/**
 * LLemonStack command line tool
 *
 * CLI interface for managing the LLemonStack local AI agent stack
 */

import { Config } from '@/core/config/config.ts'
import { isTruthy } from '@/lib/utils/compare.ts'
import { LogLevel } from '@/relayer/logger.ts'
import { Relayer } from '@/relayer/relayer.ts'
import { showAction, showError, showInfo, showWarning } from '@/relayer/ui/show.ts'
import { colors } from '@cliffy/ansi/colors'
import { Command, EnumType } from '@cliffy/command'
import { CompletionsCommand } from '@cliffy/command/completions'

const logLevelType = new EnumType(['debug', 'info', 'warning', 'error', 'fatal'])
let timerId: string | undefined

// Base command options
const main = new Command()
  .name('llmn')
  .version(Config.llemonstackVersion)
  .description('Command line for LLemonStack local AI agent stack')
  .versionOption('-v, --version', 'Get LLemonStack app version')
  .globalType('log-level', logLevelType)
  .globalOption('-l, --log-level <level:log-level>', 'Set log level.', {
    default: 'info',
  })
  .globalOption('-d, --debug', 'Enable debugging output.')
  .globalOption('-D, --verbose', 'Enable verbose output for the log level.')
  .globalOption(
    '-c --config <configFile:string>',
    'Path to a project config file.',
    {
      default: Config.defaultConfigFilePath,
    },
  )
  .globalEnv('DEBUG=<boolean>', 'Enable debugging output.')
  .globalEnv('LOG_LEVEL=<log-level>', 'Set level of logs to output')
  .action(function (_options) {
    // Show help as the default action
    this.showHelp()
  })

// Initialize the LLemonStack environment
main
  .command('config')
  .description('Enable or disable services')
  .option('--all', 'Show all services in one list', { default: false })
  .action(async (options) => {
    const config = await initConfig('config', options)
    const { configure } = await import('./scripts/configure.ts')
    await configure(config, options)
  })

// Initialize the LLemonStack environment
main
  .command('init')
  .description('Initialize the LLemonStack environment')
  .action(async (options) => {
    const config = await initConfig('init', options, true)
    const { init } = await import('./scripts/init.ts')
    await init(config)
  })

// Start the LLemonStack services
main
  .command('start')
  .description('Start the LLemonStack services')
  .arguments('[service:string]')
  .option('-n, --no-keys', 'Hide credentials', { default: false })
  .action(async (options, service?: string) => {
    const config = await initConfig('start', options)
    const { start } = await import('./scripts/start.ts')
    await start(config, {
      service,
      skipOutput: !!service,
      hideCredentials: options.keys,
    })
  })

// Stop the LLemonStack services
main
  .command('stop')
  .description('Stop the LLemonStack services')
  .option('--all', 'Stop all services', { default: true })
  .arguments('[service:string]')
  .action(async (options, service?: string) => {
    const config = await initConfig('stop', options)
    const { stop } = await import('./scripts/stop.ts')
    await stop(config, { all: options.all, service })
  })

// Restart the LLemonStack services
main
  .command('restart')
  .description('Restart the LLemonStack services')
  .arguments('[service:string]')
  .action(async (options, service?: string) => {
    const config = await initConfig('restart', options)
    const { restart } = await import('./scripts/restart.ts')
    await restart(config, { service, skipOutput: !!service })
  })

// Reset the LLemonStack environment
main
  .command('reset')
  .description('Reset the LLemonStack environment')
  .action((_options) => {
    showWarning('Reset is currently disabled. Check for LLemonStack updates later.')
    Deno.exit(1)
    // const config = await initConfig('reset', options)
    // const { reset } = await import('./scripts/reset.ts')
    // await reset(config)
  })

// Update the LLemonStack services
main
  .command('update')
  .description('Update the LLemonStack environment')
  .action(async (options) => {
    const config = await initConfig('update', options)
    const { update } = await import('./scripts/update.ts')
    await update(config)
  })

// Show all versions of all services in the stack
main
  .command('versions')
  .description('Show all versions of all services in the stack')
  .action(async (options) => {
    const config = await initConfig('versions', options)
    const { versions } = await import('./scripts/versions.ts')
    await versions(config)
  })

// Import data into services that support it
const importServices = new EnumType(['n8n', 'flowise'])
main
  .command('import')
  .description('Import data from ./import dir into supported services: n8n, flowise')
  .type('service', importServices)
  .arguments('[...service:service[]]')
  .option('--skip-start', 'Skip starting services after import', { default: false })
  .option('--skip-prompt', 'Skip confirmation prompts', { default: false })
  .option('--archive', 'Archive after import', { default: true })
  .action(async (options, ...services) => {
    const config = await initConfig('import', options)
    if (!services || services.length === 0) {
      services = importServices.values().map((svc) => [svc])
      showInfo(`Importing all supported services: ${services.join(', ')}`)
    }
    if (!options.skipStart) {
      showAction('Starting the stack to import data...')
      const { start } = await import('./scripts/start.ts')
      await start(config, { skipOutput: true })
    }
    for (const svc of services) {
      const service = svc[0]
      showAction(`Importing ${service} data...`)
      const { runImport } = await import(`./scripts/${service}_import.ts`)
      await runImport(config, {
        skipPrompt: options.skipPrompt,
        archive: options.archive,
      })
    }
  })

// Export data from services that support it
const exportServices = new EnumType(['n8n'])
main
  .command('export')
  .description('Export data to ./shared dir for supported services: n8n')
  .type('service', exportServices)
  .arguments('[...service:service[]]')
  .action(async (options, ...services) => {
    const config = await initConfig('export', options)
    if (!services || services.length === 0) {
      services = exportServices.values().map((svc) => [svc])
      showInfo(`Exporting all supported services: ${services.join(', ')}`)
    }
    for (const svc of services) {
      const service = svc[0]
      const { runExport } = await import(`./scripts/${service}_export.ts`)
      await runExport(config)
    }
  })

// Schema management commands
main.command('schema')
  .description('Postgres schema management commands')
  .type('actions', new EnumType(['create', 'remove']))
  .arguments('<action:actions> <service:string>')
  .example(
    'Create schema:',
    'llmn schema create service_name',
  )
  .example(
    'Remove schema:',
    'llmn schema remove service_name',
  )
  .action(async (options, action: string, service: string) => {
    const config = await initConfig('schema', options)
    const { schema } = await import('./scripts/schema.ts')
    await schema(config, action, service)
  })

// LiteLLM management commands
main.command('litellm')
  .description('LiteLLM management commands')
  .type('actions', new EnumType(['seed']))
  .arguments('<action:actions>')
  .example(
    'Seed LiteLLM models:',
    'llmn litellm seed',
  )
  .action(async (options, action: string) => {
    const config = await initConfig('litellm', options)
    if (action === 'seed') {
      const { loadModels } = await import('./scripts/litellm.ts')
      await loadModels(config)
    }
  })

main
  .command('completions', new CompletionsCommand())

// Run the command
await main.parse(Deno.args)

if (timerId !== undefined) {
  console.timeEnd(timerId)
}

/**
 * Initialize the LLemonStack config
 *
 * This function must be called first before loading other scripts in the below commands.
 * @param config - The path to the config file
 * @param debug - Whether to enable debug mode
 * @param logLevel - The log level to use
 * @returns The LLemonStack config
 */
async function initConfig(
  command: string,
  options: { config: string; debug?: boolean; logLevel?: LogLevel; verbose?: boolean },
  init = false,
) {
  // Start the timer
  timerId = colors.gray(`LLemonStack CLI [${command}]`)
  console.time(timerId)

  const logLevel = isTruthy(options.debug) ? 'debug' : options.logLevel ?? 'info'

  // Initialize the relayer to capture config log messages
  await Relayer.initialize({ logLevel, verbose: options.verbose })
  const relayer = Relayer.getInstance()

  // TODO: set the show relayer
  // TODO: pass in relayer instance to config

  relayer.debug('Initializing in main CLI script...')
  relayer.debug('DEBUG enabled in CLI option')

  const config = Config.getInstance()
  const result = await config.initialize(options.config, { logLevel, init })

  if (!result.success && result.error instanceof Deno.errors.NotFound) {
    relayer.show.logMessages(result.messages)
    // Show a friendly message if the config file is not found
    showAction('Please run `llmn init` to create a new project')
    Deno.exit(1)
  }

  if (options.verbose) {
    relayer.show.logMessages(result.messages)
  }

  if (!result.success) {
    showError('Error initializing config', result.error)
    Deno.exit(1)
  }

  return config
}
