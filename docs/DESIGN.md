# Design Decisions

## Flow

One main (main.ts) script to load Config and call the primary script actions.

Loading (main.ts):

1. `llmn <command>`
2. main.ts runs...
3. initializes Config
4. calls the primary command action, passing initalized config

Scripts:

1. Load required libs
2. Run subcommands
3. Output to console (via logger), including prompts
4. Can Deno.exit if needed

Libs:

1. Should implement tryCatch and generally not throw
2. Should log with context
3. Should return a TryCatchResult with messages? or just return the context id?
4. Should pipe shell command output to a logger?

Libs are reusable in cli or other future contexts.

## Config

One global object to manage pirmary script, projects and services config.

Main script loads Config and waits for it to initialize before starting a script.

```
const config = Config.getInstance()
await config.initialize()
```

## Logger

Requirements:

- Gets flags from global Deno.env: LOG_LEVEL, etc.
- Support multiple sinks: cli, file, etc.
- Support context, namespaces, etc.
- Support info, warn, error, etc. along with argbitrary dynamic methods
- Support filtering with levels, labels, etc.
- Support silent flag to prevent cli output

  See https://jsr.io/@std/log
  https://github.com/dahlia/logtape - supports lots of features including template literals and implicit contexts

  - https://logtape.org/manual/contexts
    https://github.com/onjara/optic - nice but not deno2 ready?
    https://github.com/adzejs/adze - looks promising
    https://github.com/unjs/consola

  > > > > try out adze and logtape
  > > > > test the API, namespace/context, template literals
  > > > > adze has typescript support for namespace names: https://adzejs.com/getting-started/filtering.html#restricting-namespaces-ts-only

- terminal styling

  - https://github.com/sindresorhus/ora
  - https://github.com/vadimdemedes/ink - the big daddy, uses react an yoga (flexbox)
  - https://github.com/npkgz/cli-progress
