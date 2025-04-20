import { Service } from '@/core/services/mod.ts'
import { generateJWT, generateSecretKey } from '@/lib/jwt.ts'
import { TryCatchResult } from '@/lib/try-catch.ts'
import { Secret } from '@cliffy/prompt'

const supabaseAnonJWTPayload = {
  'role': 'anon',
  'iss': 'supabase',
  'iat': 1740902400,
  'exp': 1898668800,
}

const supabaseServiceJWTPayload = {
  'role': 'service_role',
  'iss': 'supabase',
  'iat': 1740902400,
  'exp': 1898668800,
}

export class SupabaseService extends Service {
  override async init(envVars: Record<string, string> = {}): Promise<TryCatchResult<boolean>> {
    envVars.SUPABASE_JWT_SECRET = envVars.SUPABASE_JWT_SECRET || await generateSecretKey(32)

    envVars.SUPABASE_ANON_KEY = envVars.SUPABASE_ANON_KEY ||
      await generateJWT(supabaseAnonJWTPayload, envVars.SUPABASE_JWT_SECRET)

    envVars.SUPABASE_SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY ||
      await generateJWT(supabaseServiceJWTPayload, envVars.SUPABASE_JWT_SECRET)

    if (!envVars.SUPABASE_DASHBOARD_PASSWORD) {
      // Supabase dashboard password
      envVars.SUPABASE_DASHBOARD_PASSWORD = await Secret.prompt({
        message: 'Enter a password for the Supabase dashboard',
        hint: 'Grants admin access. Press enter to generate a random password',
        minLength: 8,
        hideDefault: true,
        default: generateSecretKey(16),
      })
    }

    return super.init(envVars)
  }
}

export default SupabaseService
