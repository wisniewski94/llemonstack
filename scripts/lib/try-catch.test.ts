import { assertEquals } from 'jsr:@std/assert'
import { TryCatchResult } from './try-catch.ts'
import { LogMessage } from './types.d.ts'

Deno.test('TryCatchResult - constructor initialization', () => {
  const result = new TryCatchResult({
    data: 'test data',
    error: null,
    success: true,
    messages: [{ level: 'info', message: 'initial message' }],
  })

  assertEquals(result.data, 'test data')
  assertEquals(result.error, null)
  assertEquals(result.success, true)
  assertEquals(result.messages, [{ level: 'info', message: 'initial message' }])
})

Deno.test('TryCatchResult - addMessage functionality', () => {
  const result = new TryCatchResult({
    data: 'test data',
    error: null,
    success: true,
  })

  const error = new Error('test error')
  result.addMessage('info', 'first message')
  result.addMessage('warning', 'second message')
  result.addMessage('error', 'error message', { error })

  assertEquals(result.messages, [
    { level: 'info', message: 'first message', args: undefined, error: undefined },
    { level: 'warning', message: 'second message', args: undefined, error: undefined },
    { level: 'error', message: 'error message', args: undefined, error },
  ])
})

Deno.test('TryCatchResult - unshiftMessages with multiple results', () => {
  const result1 = new TryCatchResult({
    data: 'result1',
    error: null,
    success: true,
    messages: [
      { level: 'info', message: 'result1 message 1' },
      { level: 'info', message: 'result1 message 2' },
    ],
  })

  const result2 = new TryCatchResult({
    data: 'result2',
    error: null,
    success: true,
    messages: [
      { level: 'warning', message: 'result2 message 1' },
      { level: 'warning', message: 'result2 message 2' },
    ],
  })

  const finalResult = new TryCatchResult({
    data: 'final',
    error: null,
    success: true,
    messages: [{ level: 'info', message: 'final message' }],
  })

  finalResult.unshiftMessages(result1.messages, result2.messages)

  assertEquals(finalResult.messages, [
    { level: 'info', message: 'result1 message 1' },
    { level: 'info', message: 'result1 message 2' },
    { level: 'warning', message: 'result2 message 1' },
    { level: 'warning', message: 'result2 message 2' },
    { level: 'info', message: 'final message' },
  ])
})

Deno.test('TryCatchResult - unshiftMessages with nested arrays', () => {
  const result = new TryCatchResult({
    data: 'test',
    error: null,
    success: true,
    messages: [{ level: 'info', message: 'original message' }],
  })

  const nestedMessages = [
    [
      { level: 'info', message: 'nested message 1' },
      { level: 'info', message: 'nested message 2' },
    ],
    [
      { level: 'warning', message: 'nested message 3' },
    ],
  ] as LogMessage[][]

  result.unshiftMessages(...nestedMessages)

  assertEquals(result.messages, [
    { level: 'info', message: 'nested message 1' },
    { level: 'info', message: 'nested message 2' },
    { level: 'warning', message: 'nested message 3' },
    { level: 'info', message: 'original message' },
  ])
})
