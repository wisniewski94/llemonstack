// Test script for checking if Langfuse is working.

import { load } from 'jsr:@std/dotenv'
import { Langfuse } from 'npm:langfuse'

// Load .env
const env = await load()

const secretKey = env.LANGFUSE_INIT_PROJECT_SECRET_KEY
const publicKey = env.LANGFUSE_INIT_PROJECT_PUBLIC_KEY

if (!secretKey || !publicKey) {
  throw new Error(
    'LANGFUSE_INIT_PROJECT_SECRET_KEY and LANGFUSE_INIT_PROJECT_PUBLIC_KEY must be set',
  )
}

const langfuse = new Langfuse({
  secretKey,
  publicKey,
  baseUrl: 'http://localhost:3005',
})

await langfuse.trace({
  name: 'test',
  input: {
    test: 'test',
  },
})

// const trace2 = await langfuse.trace({
//   name: 'test',
//   input: {
//     test: 'test2',
//   },
// })

await langfuse.flushAsync()

await langfuse.shutdownAsync()

console.log('Done. Check Langfuse for traces.')
