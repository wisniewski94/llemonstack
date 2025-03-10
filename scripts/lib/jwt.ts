/**
 * Crypto library for creating secret keys and JWT tokens
 *
 * https://docs.deno.com/examples/creating_and_verifying_jwt/
 * https://jsr.io/@cross/jwt
 * Test here: https://jwt.io/
 *
 * Example usage:
 * ```typescript
 * const secretKey = generateSecretKey()
 * console.log('Secret key:', secretKey)
 * console.log('Anon JWT:', await signJWT(supabaseAnonPayload, secretKey))
 * console.log('Service JWT:', await signJWT(supabaseServicePayload, secretKey))
 * ```
 */

import { signJWT } from 'jsr:@cross/jwt'
import { crypto } from 'jsr:@std/crypto'

export const supabaseAnonJWTPayload = {
  'role': 'anon',
  'iss': 'supabase',
  'iat': 1740902400,
  'exp': 1898668800,
}

export const supabaseServiceJWTPayload = {
  'role': 'service_role',
  'iss': 'supabase',
  'iat': 1740902400,
  'exp': 1898668800,
}

/**
 * Generates a cryptographically secure random UUID
 * @returns A string containing the random UUID
 */
export function generateUUID(): string {
  return crypto.randomUUID()
}

/**
 * Generates a cryptographically secure random string that can be used as a secret key
 * @param length The desired length of the secret key (defaults to 32 characters)
 * @returns A string containing the random secret key
 */
export function generateSecretKey(length: number = 32): string {
  // Create a Uint8Array buffer of the appropriate size
  // We need length bytes for length characters in hex format
  const buffer = new Uint8Array(length / 2)

  // Fill the buffer with cryptographically secure random values
  crypto.getRandomValues(buffer)

  // Convert the buffer to a hexadecimal string
  // Each byte becomes two hex characters
  const hexString = Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return hexString
}

/**
 * Generates a cryptographically secure random base64 string
 * @param bytes The desired length of the base64 string
 * @returns A string containing the random base64 string
 */
export function generateRandomBase64(bytes: number): string {
  // Create a buffer with random bytes
  const buffer = new Uint8Array(bytes)
  // Fill the buffer with cryptographically strong random values
  crypto.getRandomValues(buffer)
  // Convert to base64
  return btoa(String.fromCharCode(...buffer))
}

/**
 * Generates a JWT token for the given payload and secret key
 * @param payload - The payload to include in the JWT token
 * @param secretKey - The secret key to use for signing the JWT token
 * @returns A string containing the JWT token
 * @usage
 * ```typescript
 * const jwt = await generateJWT(supabaseAnonJWTPayload, secretKey)
 * console.log('Anon JWT:', jwt)
 * ```
 */
export async function generateJWT(
  payload: Record<string, unknown>,
  secretKey: string,
): Promise<string> {
  return await signJWT(payload, secretKey)
}
