import { Config } from './lib/config.ts'
import { confirm, showAction, showError, showInfo, showWarning } from './lib/logger.ts'
import { createServiceSchema, removeServiceSchema } from './lib/postgres.ts'
import { DEFAULT_PROJECT_NAME, isSupabaseStarted, startService } from './start.ts'
import { stopService } from './stop.ts'

const config = Config.getInstance()
await config.initialize()

export async function schema(projectName: string, action: string, service: string) {
  if (action !== 'create' && action !== 'remove') {
    showError('First argument must be either "create" or "remove"')
    Deno.exit(1)
  }
  if (!service) {
    showError('Service name is required')
    Deno.exit(1)
  }

  // Make sure it's a valid service
  if (!config.getService(service)) {
    showWarning(`Unknown service name: ${service}`)
    if (!confirm(`Continue anyway?`)) {
      Deno.exit(1)
    }
  }

  const password = Deno.env.get('POSTGRES_PASSWORD') ?? ''

  // Track whether we started supabase and need to stop it at the end
  let supabaseStarted = false

  if (!await isSupabaseStarted(projectName)) {
    if (confirm(`Supabase is not running. Shall we start it?`, true)) {
      await startService(projectName, 'supabase')
      supabaseStarted = true
    }
    // Wait a few seconds for supabase to fully initialize
    showAction('Waiting for Supabase to initialize...')
    await new Promise((resolve) => setTimeout(resolve, 3000))
    if (!await isSupabaseStarted(projectName)) {
      showError('Supabase failed to start, unable to create schema')
      Deno.exit(1)
    }
  }

  if (action === 'create') {
    showAction(`Creating schema for ${service}...`)
    const credentials = await createServiceSchema(service, {
      password,
    })
    showInfo(`Schema created for ${service}`)
    showInfo(`Username: ${credentials.username}`)
    showInfo(`Password: ${credentials.password}`)
    showInfo(`Database: ${credentials.database}`)
    showInfo(`Schema: ${credentials.schema}`)
  } else if (action === 'remove') {
    showAction(`Removing schema for ${service}...`)
    const { schema, username } = await removeServiceSchema(service, {
      password,
    })
    showInfo(`Schema ${schema} removed for ${service}`)
    showInfo(`Username: ${username}`)
  }

  if (supabaseStarted) {
    if (confirm(`Supabase was started for this operation. Shall we stop it?`)) {
      await stopService(projectName, 'supabase')
    }
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  const action = Deno.args[0]
  const service = Deno.args[1]
  schema(Deno.env.get('LLEMONSTACK_PROJECT_NAME') || DEFAULT_PROJECT_NAME, action, service)
}
