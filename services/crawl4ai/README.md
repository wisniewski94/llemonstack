# Crawl4AI

See https://docs.crawl4ai.com/core/docker-deployment/ for instructions on using the API.

## MPC Server

Crowl4AI includes an MPC server that supports SSE.

To connect the server to Claude Desktop, see [claude_desktop_config.json](claude_desktop_config.json)

Claude Desktop requires a proxy to convert the SSE into JSON-RPC over stdio.

See https://developers.cloudflare.com/agents/guides/remote-mcp-server/#connect-your-remote-mcp-server-to-claude-and-other-mcp-clients-via-a-local-proxy
