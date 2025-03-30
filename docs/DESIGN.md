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

## Services

Services are installed in the services/ dir.
There's the global services registry with prebaked LLemonStack services.
But then user could install local services as well for the project.

Services extend the Service class and can override any of the methods.

CONSIDERATIONS....

- when should the service prepare it's repo?
- when should a service inject env vars?

Durning init, services like Ollama need to set OLLAMA_HOST env vars.
But the setting of vars could be independent of needing to prep the repo for services with code.

Currently, loadEnv is independent of prepareEnv, but they seem confusing.

During prepareEnv...

- any service can update their local .env like how supabase does it (currently in start.ts)
- services can clone repos if needed
- services can update config.env

config.prepareEnv should run for enabled services

If we tried to prepareEnv during loadEnv...

1. There could be timing issues with services in the same service group not being able to get the env vars they need, but maybe not an issue?
2. Load time for config.initialize() would be significantly longer since it would be waiting for repo checks

Each service should maintain an isReady state.
If ready is false, then prepareEnv should be called on the service when needed.

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
