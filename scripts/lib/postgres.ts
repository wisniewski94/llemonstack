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
  user: string
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
 * Creates a new PostgreSQL schema for a service with appropriate permissions
 * @param serviceName Name of the service to create a schema for
 * @param pgConfig PostgreSQL connection config for admin access
 * @returns Object containing the username, password and schema name
 */
export async function createServiceSchema(
  serviceName: string,
  pgConfig: ConnectionConfig,
): Promise<SchemaCredentials> {
  const normalizedServiceName = normalizeServiceName(serviceName)

  // Create new schema and user names from service name
  const schemaName = `${normalizedServiceName}_schema`
  const newUserName = `${normalizedServiceName}_user`
  const newPassword = generateSecretKey(16)

  const clientConfig = getConnectionConfig(pgConfig)
  const client = new Client(clientConfig)
  try {
    // Connect to the database
    await client.connect()

    // Start transaction
    await client.queryArray('BEGIN')

    // Create schema
    await client.queryArray(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`)

    // Check if user already exists - if so, we'll reset password
    const userExists = await client.queryArray(
      `SELECT 1 FROM pg_roles WHERE rolname = '${newUserName}'`,
    )

    if (userExists.rows.length > 0) {
      // Reset password for existing user
      await client.queryArray(`ALTER ROLE ${newUserName} WITH LOGIN PASSWORD '${newPassword}'`)
    } else {
      // Create new user
      await client.queryArray(`CREATE ROLE ${newUserName} WITH LOGIN PASSWORD '${newPassword}'`)
    }

    // Grant permissions
    await client.queryArray(`GRANT USAGE ON SCHEMA ${schemaName} TO ${newUserName}`)
    await client.queryArray(`GRANT CREATE ON SCHEMA ${schemaName} TO ${newUserName}`)
    await client.queryArray(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL ON TABLES TO ${newUserName}`,
    )
    await client.queryArray(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL ON SEQUENCES TO ${newUserName}`,
    )
    await client.queryArray(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL ON FUNCTIONS TO ${newUserName}`,
    )

    // Set search path for user
    await client.queryArray(`ALTER ROLE ${newUserName} SET search_path TO ${schemaName}`)

    // Commit transaction
    await client.queryArray('COMMIT')

    return {
      user: newUserName,
      username: `${newUserName}.${clientConfig.tenant}`,
      password: newPassword,
      schema: schemaName,
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
): Promise<{ success: boolean; message: string }> {
  const normalizedServiceName = normalizeServiceName(serviceName)
  const schemaName = `${normalizedServiceName}_schema`
  const userName = `${normalizedServiceName}_user`

  const clientConfig = getConnectionConfig(pgConfig)
  const client = new Client(clientConfig)

  try {
    // Connect to the database
    await client.connect()

    // Start transaction
    await client.queryArray('BEGIN')

    // Check if schema exists
    const schemaExists = await client.queryArray(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = '${schemaName}'`,
    )

    // Check if user exists
    const userExists = await client.queryArray(
      `SELECT 1 FROM pg_roles WHERE rolname = '${userName}'`,
    )

    // Drop schema if it exists (will cascade to all objects in the schema)
    if (schemaExists.rows.length > 0) {
      await client.queryArray(`DROP SCHEMA ${schemaName} CASCADE`)
    }

    // Drop user if it exists
    if (userExists.rows.length > 0) {
      // First revoke all privileges
      await client.queryArray(
        `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${userName}`,
      )
      await client.queryArray(
        `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${userName}`,
      )
      await client.queryArray(
        `REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ${userName}`,
      )
      await client.queryArray(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${userName}`)

      // Then drop the role
      await client.queryArray(`DROP ROLE ${userName}`)
    }

    // Commit transaction
    await client.queryArray('COMMIT')

    return {
      success: true,
      message: `Successfully removed schema "${schemaName}" and user "${userName}"`,
    }
  } catch (error) {
    // Rollback transaction on error
    await client.queryArray('ROLLBACK')

    return {
      success: false,
      message: `Failed to remove schema and user: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  } finally {
    // Close client connection
    await client.end()
  }
}
