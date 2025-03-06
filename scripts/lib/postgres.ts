import { Client } from 'https://deno.land/x/postgres/mod.ts'
import { generateSecretKey } from './jwt.ts'
interface SchemaCredentials {
  username: string
  password: string
  schema: string
}

/**
 * Creates a new PostgreSQL schema for a service with appropriate permissions
 * @param serviceName Name of the service to create a schema for
 * @param pgConfig PostgreSQL connection config for admin access
 * @returns Object containing the username, password and schema name
 */
export async function createServiceSchema(
  serviceName: string,
  pgConfig: {
    hostname: string
    port: number
    database: string
    user: string
    password: string
  },
): Promise<SchemaCredentials> {
  // Normalize service name to use only alphanumeric and underscore
  const normalizedServiceName = serviceName
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')

  // Create schema and user names
  const schemaName = `${normalizedServiceName}_schema`
  const userName = `${normalizedServiceName}_user`

  // Generate a secure random password
  const password = generateSecretKey(16)

  // Create a client connection with admin credentials
  const client = new Client(pgConfig)

  try {
    // Connect to the database
    await client.connect()

    // Start transaction
    await client.queryArray('BEGIN')

    // Create schema
    await client.queryArray(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`)

    // Check if user already exists - if so, we'll reset password
    const userExists = await client.queryArray(
      `SELECT 1 FROM pg_roles WHERE rolname = $1`,
      [userName],
    )

    if (userExists.rows.length > 0) {
      // Reset password for existing user
      await client.queryArray(`ALTER ROLE ${userName} WITH PASSWORD $1`, [password])
    } else {
      // Create new user
      await client.queryArray(`CREATE ROLE ${userName} WITH LOGIN PASSWORD $1`, [password])
    }

    // Grant permissions
    await client.queryArray(`GRANT USAGE ON SCHEMA ${schemaName} TO ${userName}`)
    await client.queryArray(`GRANT CREATE ON SCHEMA ${schemaName} TO ${userName}`)
    await client.queryArray(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL ON TABLES TO ${userName}`,
    )
    await client.queryArray(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL ON SEQUENCES TO ${userName}`,
    )
    await client.queryArray(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL ON FUNCTIONS TO ${userName}`,
    )

    // Set search path for user
    await client.queryArray(`ALTER ROLE ${userName} SET search_path TO ${schemaName}`)

    // Commit transaction
    await client.queryArray('COMMIT')

    return {
      username: userName,
      password,
      schema: schemaName,
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

// Usage example:
/*
const credentials = await createServiceSchema('my_service', {
  hostname: 'localhost',
  port: 5432,
  database: 'my_database',
  user: 'postgres',
  password: 'admin_password'
});

console.log(`
Database credentials created:
Username: ${credentials.username}
Password: ${credentials.password}
Schema: ${credentials.schema}
Connection string: postgresql://${credentials.username}:${credentials.password}@localhost:5432/my_database
`);
*/
