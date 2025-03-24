#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write --allow-net

/**
 * LLemonStack command line tool
 *
 * CLI interface for managing the LLemonStack local AI agent stack
 */

import { Command, EnumType } from '@cliffy/command'
import { CompletionsCommand } from '@cliffy/command/completions'
import { Config } from './scripts/lib/config/config.ts'
import { showAction, showError, showInfo, showMessages } from './scripts/lib/logger.ts'
import { DEFAULT_PROJECT_NAME, start } from './scripts/start.ts'

const config = Config.getInstance()
const result = await config.initialize()
showMessages(result.messages)
if (!result.success) {
  showError('Error initializing config', result.error)
  Deno.exit(1)
}

const logLevelType = new EnumType(['debug', 'info', 'warn', 'error'])

// Base command options
const main = new Command()
  .name('llmn')
  .version(config.installVersion)
  .description('Command line for LLemonStack local AI agent stack')
  .globalEnv('DEBUG=<enable:boolean>', 'Enable debug output')
  .globalEnv('LLEMONSTACK_PROJECT_NAME=<project:string>', 'Project name')
  .globalOption('-d, --debug', 'Enable debug output.')
  .globalType('log-level', logLevelType)
  .globalOption('-l, --log-level <level:log-level>', 'Set log level.', {
    default: 'info',
  })
  .globalOption(
    '-p --project <project:string>',
    'Project name',
    {
      default: Deno.env.get('LLEMONSTACK_PROJECT_NAME'),
    },
  )
  // Default action to show help
  .action(function () {
    this.showHelp()
  })

// Initialize the LLemonStack environment
main
  .command('init')
  .description('Initialize the LLemonStack environment')
  .action(async (options) => {
    const { init } = await import('./scripts/init.ts')
    await init(options.project || DEFAULT_PROJECT_NAME)
  })

// Start the LLemonStack services
main
  .command('start')
  .description('Start the LLemonStack services')
  .arguments('[service:string]')
  .action(async (options, service?: string) => {
    const { start } = await import('./scripts/start.ts')
    await start(options.project, { service, skipOutput: !!service })
  })

// Stop the LLemonStack services
main
  .command('stop')
  .description('Stop the LLemonStack services')
  .option('--all', 'Stop all services', { default: true })
  .arguments('[service:string]')
  .action(async (options, service?: string) => {
    const { stop } = await import('./scripts/stop.ts')
    await stop(options.project || DEFAULT_PROJECT_NAME, { all: options.all, service })
  })

// Restart the LLemonStack services
main
  .command('restart')
  .description('Restart the LLemonStack services')
  .arguments('[service:string]')
  .action(async (options, service?: string) => {
    const { restart } = await import('./scripts/restart.ts')
    await restart(options.project || DEFAULT_PROJECT_NAME, { service, skipOutput: !!service })
  })

// Reset the LLemonStack environment
main
  .command('reset')
  .description('Reset the LLemonStack environment')
  .action(async (options) => {
    const { reset } = await import('./scripts/reset.ts')
    await reset(options.project || DEFAULT_PROJECT_NAME)
  })

// Update the LLemonStack services
main
  .command('update')
  .description('Update the LLemonStack environment')
  .action(async (options) => {
    const { update } = await import('./scripts/update.ts')
    await update(options.project || DEFAULT_PROJECT_NAME)
  })

// Show all versions of all services in the stack
main
  .command('versions')
  .description('Show all versions of all services in the stack')
  .action(async (options) => {
    const { versions } = await import('./scripts/versions.ts')
    await versions(options.project || DEFAULT_PROJECT_NAME)
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
    if (!services || services.length === 0) {
      services = importServices.values().map((svc) => [svc])
      showInfo(`Importing all supported services: ${services.join(', ')}`)
    }
    if (!options.skipStart) {
      showAction('Starting the stack to import data...')
      await start(options.project || DEFAULT_PROJECT_NAME, { skipOutput: true })
    }
    for (const svc of services) {
      const service = svc[0]
      showAction(`Importing ${service} data...`)
      const { runImport } = await import(`./scripts/${service}_import.ts`)
      await runImport(options.project || DEFAULT_PROJECT_NAME, {
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
    if (!services || services.length === 0) {
      services = exportServices.values().map((svc) => [svc])
      showInfo(`Exporting all supported services: ${services.join(', ')}`)
    }
    for (const svc of services) {
      const service = svc[0]
      const { runExport } = await import(`./scripts/${service}_export.ts`)
      await runExport(options.project || DEFAULT_PROJECT_NAME)
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
    const { schema } = await import('./scripts/schema.ts')
    await schema(options.project || DEFAULT_PROJECT_NAME, action, service)
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
  .action(async (_options, action: string) => {
    if (action === 'seed') {
      const { loadModels } = await import('./scripts/litellm.ts')
      await loadModels()
    }
  })

main
  .command('completions', new CompletionsCommand())

// Run the command
await main.parse(Deno.args)
