# Crawl4AI

See https://docs.crawl4ai.com/core/docker-deployment/ for instructions on using the API.

## MCP Server

Crowl4AI includes an MCP server that supports SSE.

To connect the server to Claude Desktop, see [claude_desktop_config.json](claude_desktop_config.json)

Claude Desktop requires a proxy to convert the SSE into JSON-RPC over stdio.

See https://developers.cloudflare.com/agents/guides/remote-mcp-server/#connect-your-remote-mcp-server-to-claude-and-other-mcp-clients-via-a-local-proxy

For MCP clients that support SSE, use this config:

```json
"mcpServers": {
  "crawl4ai": {
    "transport": "sse",
    "url": "http://localhost:11235/mcp/sse"
  }
}
```
