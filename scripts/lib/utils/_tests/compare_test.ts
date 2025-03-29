import { assertEquals } from 'jsr:@std/assert'
import { isTruthy } from '../compare.ts'

// Test null and undefined
Deno.test('isTruthy - returns false for null and undefined', () => {
  assertEquals(isTruthy(null), false)
  assertEquals(isTruthy(undefined), false)
})

// Test boolean values
Deno.test('isTruthy - returns correct value for boolean inputs', () => {
  assertEquals(isTruthy(true), true)
  assertEquals(isTruthy(false), false)
})

// Test string values
Deno.test('isTruthy - returns true for string "true" or "1" (case insensitive)', () => {
  assertEquals(isTruthy('true'), true)
  assertEquals(isTruthy('TRUE'), true)
  assertEquals(isTruthy('1'), true)
  assertEquals(isTruthy(' true '), true) // Tests trim functionality
  assertEquals(isTruthy(' 1 '), true) // Tests trim functionality
})

Deno.test('isTruthy - returns false for other string values', () => {
  assertEquals(isTruthy(''), false)
  assertEquals(isTruthy('false'), false)
  assertEquals(isTruthy('0'), false)
  assertEquals(isTruthy('truthy'), false)
})

// Test other types
Deno.test('isTruthy - returns false for other types', () => {
  assertEquals(isTruthy(0), false)
  assertEquals(isTruthy(1), false)
  assertEquals(isTruthy([]), false)
  assertEquals(isTruthy({}), false)
})
