import { Config } from '@/core/config/config.ts'
import { createServiceSchema, removeServiceSchema } from '@/lib/postgres.ts'
import { ServiceType } from '@/types'
import { startService } from './start.ts'

async function isSupabaseStarted(config: Config) {
  const supabase = config.getServiceByName('supabase')
  return await supabase?.isRunning() || false
}

export async function schema(config: Config, action: string, service: string) {
  const show = config.relayer.show
  if (action !== 'create' && action !== 'remove') {
    show.error('First argument must be either "create" or "remove"')
    Deno.exit(1)
  }
  if (!service) {
    show.error('Service name is required')
    Deno.exit(1)
  }

  // Make sure it's a valid service
  if (!config.getServiceByName(service)) {
    show.warn(`Unknown service name: ${service}`)
    if (!show.confirm(`Continue anyway?`)) {
      Deno.exit(1)
    }
  }

  const password = Deno.env.get('POSTGRES_PASSWORD') ?? ''

  // Track whether we started supabase and need to stop it at the end
  let supabaseStarted = false
  let supabaseService: ServiceType | null = null

  if (!await isSupabaseStarted(config)) {
    if (show.confirm(`Supabase is not running. Shall we start it?`, true)) {
      supabaseService = await startService(config, 'supabase')
      supabaseStarted = true
    }
    // Wait a few seconds for supabase to fully initialize
    show.action('Waiting for Supabase to initialize...')
    await new Promise((resolve) => setTimeout(resolve, 3000))
    if (!await isSupabaseStarted(config)) {
      show.error('Supabase failed to start, unable to create schema')
      Deno.exit(1)
    }
  }

  if (action === 'create') {
    show.action(`Creating schema for ${service}...`)
    const credentials = await createServiceSchema(service, {
      password,
    })
    show.info(`Schema created for ${service}`)
    show.info(`Username: ${credentials.username}`)
    show.info(`Password: ${credentials.password}`)
    show.info(`Database: ${credentials.database}`)
    show.info(`Schema: ${credentials.schema}`)
  } else if (action === 'remove') {
    show.action(`Removing schema for ${service}...`)
    const { schema, username } = await removeServiceSchema(service, {
      password,
    })
    show.info(`Schema ${schema} removed for ${service}`)
    show.info(`Username: ${username}`)
  }

  if (supabaseStarted && supabaseService) {
    if (show.confirm(`Supabase was started for this operation. Shall we stop it?`)) {
      await supabaseService.stop()
    }
  }
}
