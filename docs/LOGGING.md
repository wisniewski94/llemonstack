# Logging

LLemonStack's logging system makes it easy to show relevant info to the user
as well as debug when things go wrong.

## General Concept

1. Messages are always logged, never discarded
2. Messages are filtered and shown to the user based on contexts

3. Root /default log level, set when a script runs
4. Dynamic - scripts can dynamically change the current log level

5. When something goes wrong, like an unexpected error,
   a stack trace of the previously not shown messages is displayed.

Always avoid the problem of something breaks but the log level was too
high to see useful output.

Context are used to provide structured logging.

Contexts are nested and implicit. Meaning when a context is set, any
code that run (sync or async) inherits the parent context.

Contexts:

- script: version, start, stop, etc.
- module: config, docker, git, etc.
- function: initialize, runCommand, etc.

All logs are structured.

Code can be wrapped in a context.

Code can configure the output level filters before running code.
e.g. Start script can enable debug output for git module during repo setup
that automatically reverts to the previous output levels once the code block finishes.

This should probably be implemented with a Logtape filter:

- gets all messages
- saves to a buffer for stack trace
- inspects the messsage context for any dynamic level filtering
- passes along the message

Any code can then later retrieve the stack or dynamically update the
filtering. e.g. If a command is taking over 200ms to complete, then
it changes the filter so the user can see the output.

```ts
// WIP: example concept, just thinking through the API...

silent()
setTimeout(()=>silent(false), 250)
await doAsyncWork()
revert()

// or
withContext('script-name')
  .silent()
  .withTimeout(250, () => show('This is taking awhile'))
  .withTimeout(500, showAll)
  .withTimeout(5000, abort)
  .showSpinner()
  .run(async () => {
    async setupRepos()
  })

show('This took {runTime}')

throw 'Uncaught error'
// Global catch would show the last X debug messages
```

{runTime} is auto added to message context with the time elapsed for the
last run().

## Add Message vs Logging

TryCatch module uses message passing. This should be changed to logging
instead. The Relayer helper methods can auto fetch the logged messages
for scripts to display.

```
const results = away tryCatch(doStuff())
if (!results.success) {
  showLogs('debug', 20) // show last 20 log messages debug or higher
  fatal('Unable to continue')
}
```
