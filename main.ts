#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write --allow-net

/**
 * LLemonStack command line tool
 *
 * A unified CLI interface for managing the LLemonStack local AI agent stack
 */

import { Command, EnumType } from '@cliffy/command'
import { DEFAULT_PROJECT_NAME, VERSION } from './scripts/start.ts'

const logLevelType = new EnumType(['debug', 'info', 'warn', 'error'])

// Base command options
const main = new Command()
  .name('llmn')
  .version(VERSION)
  .description('Command line for LLemonStack local AI agent stack')
  .type('log-level', logLevelType)
  .env('DEBUG=<enable:boolean>', 'Enable debug output.')
  .option('-d, --debug', 'Enable debug output.')
  .option('-l, --log-level <level:log-level>', 'Set log level.', {
    default: 'info',
  })

// Initialize the LLemonStack environment
const init = new Command()
  .name('init')
  .description('Initialize the LLemonStack environment')
  .action(async (options) => {
    const { init } = await import('./scripts/init.ts')
    await init(options.projectName || DEFAULT_PROJECT_NAME)
  })

const start = new Command()
  .description('Start the LLemonStack services')
  .action(async (options) => {
    const { start } = await import('./scripts/start.ts')
    await start(options.projectName || DEFAULT_PROJECT_NAME)
  })

const stop = new Command()
  .description('Stop the LLemonStack services')
  .option('--all', 'Stop all services', { default: true })
  .action(async (options) => {
    const { stop } = await import('./scripts/stop.ts')
    await stop(options.projectName || DEFAULT_PROJECT_NAME, { all: options.all })
  })

const restart = new Command()
  .description('Restart the LLemonStack services')
  .action(async (options) => {
    const { restart } = await import('./scripts/restart.ts')
    await restart(options.projectName || DEFAULT_PROJECT_NAME)
  })

const reset = new Command()
  .description('Reset the LLemonStack environment')
  .action(async (options) => {
    const { reset } = await import('./scripts/reset.ts')
    await reset(options.projectName || DEFAULT_PROJECT_NAME)
  })

const update = new Command()
  .description('Update the LLemonStack environment')
  .action(async (options) => {
    const { update } = await import('./scripts/update.ts')
    await update(options.projectName || DEFAULT_PROJECT_NAME)
  })

const versions = new Command()
  .description('Show versions of all components')
  .action(async (options) => {
    const { versions } = await import('./scripts/versions.ts')
    await versions(options.projectName || DEFAULT_PROJECT_NAME)
  })

// // N8N workflow management commands
// const n8n = new Command()
//   .command('n8n')
//   .description('N8N workflow management commands')

// n8n
//   .command('import')
//   .description('Import N8N workflows')
//   .option('--skip-start', 'Skip starting services after import', { default: false })
//   .option('--skip-prompt', 'Skip confirmation prompts', { default: false })
//   .option('--archive', 'Archive after import', { default: true })
//   .action(async (options) => {
//     const { runImport } = await import('./scripts/n8n_import.ts')
//     await runImport(DEFAULT_PROJECT_NAME, {
//       skipPrompt: options.skipPrompt,
//       archiveAfterImport: options.archive,
//     })
//   })

// n8n
//   .command('export')
//   .description('Export N8N workflows')
//   .action(async () => {
//     const { runExport } = await import('./scripts/n8n_export.ts')
//     await runExport(DEFAULT_PROJECT_NAME)
//   })

// Flowise management commands
// const flowise = new Command()
//   .command('flowise')
//   .description('Flowise management commands')

// flowise
//   .command('import')
//   .description('Import Flowise flows')
//   .option('--skip-start', 'Skip starting services after import', { default: false })
//   .option('--skip-prompt', 'Skip confirmation prompts', { default: false })
//   .option('--archive', 'Archive after import', { default: true })
//   .action(async (options) => {
//     const { runImport: importFlowise } = await import('./scripts/flowise_import.ts')
//     await importFlowise(DEFAULT_PROJECT_NAME, {
//       skipPrompt: options.skipPrompt,
//       archiveAfterImport: options.archive,
//     })
//   })

// Schema management commands
const schema = new Command()
  .command('schema')
  .description('Database schema management commands')

schema
  .command('create')
  .description('Create database schemas')
  .arguments('<service:string>')
  .action(async (options: unknown, service: string) => {
    const { schema } = await import('./scripts/schema.ts')
    await schema(options.projectName || DEFAULT_PROJECT_NAME, 'create', service)
  })

schema
  .command('remove')
  .description('Remove database schemas')
  .arguments('<service:string>')
  .action(async (options: unknown, service: string) => {
    const { schema } = await import('./scripts/schema.ts')
    await schema(options.projectName || DEFAULT_PROJECT_NAME, 'remove', service)
  })

// LiteLLM management commands
const litellm = new Command()
  .description('LiteLLM management commands')
  .command('models:local')
  .description(
    'Add models to LiteLLM from Ollama and any OpenAI compatible provider running on localhost:LOCAL_LLM_OPENAI_HOST_PORT',
  )
  .action(async () => {
    const { loadModels } = await import('./scripts/litellm.ts')
    await loadModels()
  })

// Main command chain
await main
  .command('init', init)
  .command('start', start)
  .command('stop', stop)
  .command('restart', restart)
  .command('reset', reset)
  .command('update', update)
  .command('versions', versions)
  .command('schema', schema)
  // // .command('n8n', n8n)
  // .command('flowise', flowise)
  .command('litellm', litellm)
  .parse(Deno.args)
