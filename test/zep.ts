// Zep test example to check if zep is working
// Usage: ZEP_API_SECRET=your-zep-api-key deno test/zep.ts
// @ts-nocheck
// deno-lint-ignore-file

import { ZepClient } from 'npm:@getzep/zep-js'

const API_KEY = Deno.env.get('ZEP_API_SECRET')
const BASE_URL = 'http://localhost:8010'

console.log('API_KEY', API_KEY)

const zep = new ZepClient({ apiKey: API_KEY, baseUrl: BASE_URL })

import type {
  CreateSessionRequest,
  CreateUserRequest,
  SessionSearchQuery,
} from 'npm:@getzep/zep-js/api'
import { v4 as uuidv4 } from 'npm:uuid'

const client = new ZepClient({
  apiKey: API_KEY,
  baseUrl: BASE_URL,
})

// A new user identifier
const userId = uuidv4()
const userRequest: CreateUserRequest = {
  userId: userId,
  email: 'user@example.com',
  firstName: 'Jane',
  lastName: 'Smith',
  metadata: { foo: 'bar' },
}
const newUser = await client.user.add(userRequest)

// Create a chat session
const sessionId = uuidv4()
const sessionRequest: CreateSessionRequest = {
  sessionId: sessionId,
  userId: userId,
  metadata: { foo: 'bar' },
}

// A new session identifier
const session = await client.memory.addSession(sessionRequest)

// Add a memory to the session
await client.memory.add(sessionId, {
  messages: [
    {
      role: 'Researcher',
      roleType: 'user',
      content: 'Who was Octavia Butler?',
    },
  ],
})

// Get session memory
const memory = await client.memory.get(sessionId)
const messages = memory.messages // List of messages in the session (quantity determined by optional lastN parameter in memory.get)
const relevantFacts = memory.relevantFacts // List of facts relevant to the recent messages in the session

// Search user facts across all sessions
const searchQuery: SessionSearchQuery = {
  userId: userId,
  searchScope: 'facts',
  text: 'What science fiction books did I recently read?',
}
const searchResponse = await client.memory.searchSessions(searchQuery)
const facts = searchResponse.results?.map((result) => result.fact)

console.log('facts', facts)
