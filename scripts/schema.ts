import { createServiceSchema, removeServiceSchema } from './lib/postgres.ts'
import { ALL_COMPOSE_SERVICES, loadEnv, showAction, showError, showInfo } from './start.ts'

async function run() {
  // Check if the first argument is start or stop
  const action = Deno.args[0]
  // Get the service name from the second argument
  const service = Deno.args[1]

  if (action !== 'create' && action !== 'remove') {
    showError('First argument must be either "create" or "remove"')
    Deno.exit(1)
  }
  if (!service) {
    showError('Service name is required')
    Deno.exit(1)
  }

  loadEnv()

  // Make sure it's a valid service
  if (!ALL_COMPOSE_SERVICES.find(([s]) => s === service)) {
    if (!confirm(`Unknown service: ${service}. Continue?`)) {
      Deno.exit(1)
    }
  }

  const password = Deno.env.get('POSTGRES_PASSWORD') ?? ''

  if (action === 'create') {
    showAction(`Creating schema for ${service}...`)
    const credentials = await createServiceSchema(service, {
      password,
    })
    showInfo(`Schema created for ${service}`)
    showInfo(`Username: ${credentials.username}`)
    showInfo(`Password: ${credentials.password}`)
    showInfo(`Database: ${credentials.database}`)
  } else if (action === 'remove') {
    showAction(`Removing schema for ${service}...`)
    const { schema, username } = await removeServiceSchema(service, {
      password,
    })
    showInfo(`Schema ${schema} removed for ${service}`)
    showInfo(`Username: ${username}`)
  }
}

// Run script if this file is executed directly
if (import.meta.main) {
  run()
}
