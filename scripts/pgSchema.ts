import { createServiceSchema } from './lib/postgres.ts'
import { loadEnv } from './lib/env.ts'

aysnc function createPgSchema(serviceName: string) {
  const pgConfig = {
    hostname: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: Deno.env.get('POSTGRES_PASSWORD'),
  }

  await createServiceSchema(serviceName, pgConfig)
}

loadEnv()
await createPgSchema('testservice')
