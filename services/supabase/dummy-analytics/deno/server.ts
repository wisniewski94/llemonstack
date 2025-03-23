// server.ts
// Dummy server that accepts http connections and discards all data.
// @ts-nocheck
// deno-lint-ignore

import { serve } from 'https://deno.land/std/http/server.ts'

// Simple request counter for basic monitoring
let requestCount = 0

/**
 * Main request handler
 * Accepts and discards Logflare-type requests
 */
async function handler(req: Request): Promise<Response> {
  requestCount++

  // Get request details for logging
  const url = new URL(req.url)
  const method = req.method

  console.log(`[${new Date().toISOString()}] ${method} ${url.pathname} (Total: ${requestCount})`)

  // Handle health check endpoint
  if (url.pathname === '/health') {
    return new Response(
      JSON.stringify({
        status: 'ok',
        requests_handled: requestCount,
        uptime: process.uptime(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  // For any Logflare endpoint, just accept and discard
  if (url.pathname.startsWith('/api') || url.pathname === '/logs') {
    // We don't need to process the body, just acknowledge receipt
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Handle unknown routes
  return new Response('OK', { status: 200 })
}

// Start server
console.log('Starting lightweight Logflare sink server...')
await serve(handler, { port: 4000 })
