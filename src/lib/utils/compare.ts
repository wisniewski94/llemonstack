/**
 * Misc utility functions
 */

const TRUTHY_REGEX = /^1$|^true$/i

/**
 * Check if a value is truthy
 * @param value - The value to check
 * @returns True if the value is truthy, false otherwise
 */
export function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return TRUTHY_REGEX.test(value.trim())
  }
  return false
}
