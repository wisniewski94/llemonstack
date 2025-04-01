/**
 * Tools for creating and removing a new PostgreSQL schema for a service
 *
 * Generates a new user and password for a service and creates a custom schema
 * for the service to use. This effectively creates a separate database for the
 * service to protect it from conflicting with other services tables and functions.
 *
 * Usage example:
 * ```typescript
 * loadEnv()
 * const credentials = await createServiceSchema(
 *   'test_new_service_schema',
 *   {
 *     password: Deno.env.get('POSTGRES_PASSWORD') ?? '',
 *   },
 * )
 *
 * console.log(`
 * Database credentials created:
 * User: ${credentials.user}
 * Username: ${credentials.username}
 * Password: ${credentials.password}
 * Schema: ${credentials.schema}
 * Tenant: ${credentials.tenant}
 * Database: ${credentials.database}
 * Hostname: ${credentials.hostname}
 * Port: ${credentials.port}
 * Connection string: postgresql://${credentials.username}:${credentials.password}@${credentials.hostname}:${credentials.port}/${credentials.database}
 * )
 *
 * const removed = await removeServiceSchema(
 *   'test_new_service_schema',
 *   {
 *     password: Deno.env.get('POSTGRES_PASSWORD') ?? '',
 *   },
 * )
```
*/

import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts'
import { generateSecretKey } from './jwt.ts'

export interface SchemaCredentials {
  username: string
  password: string
  schema: string
  tenant?: string
  database: string
  hostname: string
  port: number
}

export interface ConnectionConfig {
  hostname?: string
  port?: number
  database?: string
  user?: string
  tenant?: string
  password: string // Admin password
}

interface ClientConfig {
  hostname: string
  port: number
  database: string
  user: string
  tenant: string
  password: string // Admin password
}

function normalizeServiceName(serviceName: string) {
  return serviceName
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
}

function getUserSchema(serviceName: string) {
  const normalizedServiceName = normalizeServiceName(serviceName)
  return {
    schema: `service_${normalizedServiceName}`,
    username: normalizedServiceName,
  }
}

function getConnectionConfig({
  hostname = 'localhost',
  port = 5432,
  database = 'postgres',
  user = 'postgres',
  tenant = 'llemonstack',
  password,
}: ConnectionConfig): ClientConfig {
  const clientConfig = {
    hostname,
    port,
    database,
    user: tenant ? `${user}.${tenant}` : user,
    tenant,
    password,
  }
  return clientConfig
}

/**
 * Checks if a PostgreSQL connection is valid
 * @param pgConfig PostgreSQL connection config
 * @returns Promise that resolves to true if connection is valid, false otherwise
 */
export async function isPostgresConnectionValid(
  pgConfig: ConnectionConfig,
): Promise<boolean> {
  const clientConfig = getConnectionConfig(pgConfig)
  const client = new Client(clientConfig)

  try {
    // Attempt to connect to the database
    await client.connect()

    // Execute a simple query to verify the connection
    const result = await client.queryArray('SELECT 1')

    // If we get here, the connection is valid
    return result.rows.length > 0
  } catch (error) {
    // Connection failed
    console.error('PostgreSQL connection failed:', error)
    return false
  } finally {
    // Always close the connection
    try {
      await client.end()
    } catch (_error) {
      // Ignore errors during disconnect
    }
  }
}

/**
 * Creates a new PostgreSQL schema for a service with appropriate permissions
 * @param serviceName Name of the service to create a schema for
 * @param pgConfig PostgreSQL connection config for admin access
 * @returns Object containing the username, password and schema name
 */
export async function createServiceSchema(
  serviceName: string,
  pgConfig: ConnectionConfig,
): Promise<SchemaCredentials> {
  const { schema, username } = getUserSchema(serviceName)
  const password = generateSecretKey(22)

  const clientConfig = getConnectionConfig(pgConfig)
  const client = new Client(clientConfig)

  try {
    // Connect to the database
    await client.connect()

    // Start transaction
    await client.queryArray('BEGIN')

    // Create schema
    await client.queryArray(`CREATE SCHEMA IF NOT EXISTS ${schema}`)

    // Check if user already exists - if so, we'll reset password
    const userExists = await client.queryArray(
      `SELECT 1 FROM pg_roles WHERE rolname = '${username}'`,
    )

    if (userExists.rows.length > 0) {
      // Reset password for existing user
      await client.queryArray(`ALTER ROLE ${username} WITH LOGIN PASSWORD '${password}'`)
    } else {
      // Create new user
      await client.queryArray(`CREATE ROLE ${username} WITH LOGIN PASSWORD '${password}'`)
    }

    // Grant permissions on new schema
    await client.queryArray(`GRANT ALL PRIVILEGES ON SCHEMA ${schema} TO ${username}`)
    await client.queryArray(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schema} TO ${username}`)
    await client.queryArray(
      `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${schema} TO ${username}`,
    )
    await client.queryArray(
      `GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ${schema} TO ${username}`,
    )

    // Set default privileges for future objects in the schema
    await client.queryArray(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT ALL ON TABLES TO ${username}`,
    )
    await client.queryArray(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT ALL ON SEQUENCES TO ${username}`,
    )
    await client.queryArray(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT ALL ON FUNCTIONS TO ${username}`,
    )

    // Grant permissions on extensions schema
    // Run `\dx` in psql to see available extensions
    await client.queryArray(`GRANT USAGE ON SCHEMA extensions TO ${username}`)
    await client.queryArray(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO ${username}`)

    // Grant permissions on public schema where vector is installed
    await client.queryArray(`GRANT USAGE ON SCHEMA public TO ${username}`)
    await client.queryArray(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${username}`)

    // Set search path for user
    // extensions is needed to access uuid functions
    // public is needed to access vector
    await client.queryArray(
      `ALTER ROLE ${username} SET search_path TO ${schema},extensions,public`,
    )

    // Commit transaction
    await client.queryArray('COMMIT')

    return {
      username,
      password,
      schema,
      tenant: clientConfig.tenant,
      database: clientConfig.database,
      hostname: clientConfig.hostname,
      port: clientConfig.port,
    }
  } catch (error) {
    // Rollback transaction on error
    await client.queryArray('ROLLBACK')
    throw error
  } finally {
    // Close client connection
    await client.end()
  }
}

/**
 * Removes a PostgreSQL schema and user that were created by createServiceSchema
 * @param serviceName Name of the service whose schema should be removed
 * @param pgConfig PostgreSQL connection config for admin access
 * @returns A success message
 */
export async function removeServiceSchema(
  serviceName: string,
  pgConfig: ConnectionConfig,
): Promise<SchemaCredentials> {
  const { schema, username } = getUserSchema(serviceName)

  const clientConfig = getConnectionConfig(pgConfig)
  const client = new Client(clientConfig)

  try {
    // Connect to the database
    await client.connect()

    // Start transaction
    await client.queryArray('BEGIN')

    // Check if schema exists
    const schemaExists = await client.queryArray(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = '${schema}'`,
    )

    // Drop schema if it exists (will cascade to all objects in the schema)
    if (schemaExists.rows.length > 0) {
      await client.queryArray(`DROP SCHEMA ${schema} CASCADE`)
    }

    // Check if user exists
    const userExists = await client.queryArray(
      `SELECT 1 FROM pg_roles WHERE rolname = '${username}'`,
    )

    // Drop user if it exists
    if (userExists.rows.length > 0) {
      // Revoke permissions from schemas (cleanup, although CASCADE on schema drop handles most of this)
      await client.queryArray(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${username}`)
      await client.queryArray(`REVOKE ALL PRIVILEGES ON SCHEMA extensions FROM ${username}`)

      await client.queryArray(
        `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions FROM ${username}`,
      )
      await client.queryArray(`REVOKE USAGE ON SCHEMA extensions FROM ${username}`)

      await client.queryArray(`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM ${username}`)
      await client.queryArray(`REVOKE USAGE ON SCHEMA public FROM ${username}`)

      // Then drop the role
      await client.queryArray(`DROP ROLE ${username}`)
    }

    // Commit transaction
    await client.queryArray('COMMIT')

    return {
      username,
      password: '',
      schema,
      tenant: clientConfig.tenant,
      database: clientConfig.database,
      hostname: clientConfig.hostname,
      port: clientConfig.port,
    }
  } catch (error) {
    // Rollback transaction on error
    await client.queryArray('ROLLBACK')
    throw error
  } finally {
    // Close client connection
    await client.end()
  }
}
