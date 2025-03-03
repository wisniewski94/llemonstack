#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run --allow-write

/**
 * LLemonStack command line tool
 *
 * WIP, this is just here to test out cliffy
 */

import { Command, EnumType } from '@cliffy/command'

const logLevelType = new EnumType(['debug', 'info', 'warn', 'error'])

await new Command()
  .name('llemonstack')
  .version('0.1.0')
  .description('Command line for LLemonStack local AI agent stack')
  .type('log-level', logLevelType)
  .env('DEBUG=<enable:boolean>', 'Enable debug output.')
  .option('-d, --debug', 'Enable debug output.')
  .option('-l, --log-level <level:log-level>', 'Set log level.', {
    default: 'info',
  })
  .arguments('<input:string> [output:string]')
  // .action((options, ...args) => {})
  .parse(Deno.args)
