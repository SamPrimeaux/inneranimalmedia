# Cursor: InnerAnimal MCP + Chrome DevTools MCP

The Cloudflare **InnerAnimal MCP** (`mcp.inneranimalmedia.com`) and **chrome-devtools-mcp** are different transports:

| Server | Where it runs | Protocol |
|--------|-----------------|----------|
| `inneranimalmedia` | Cloudflare Worker | HTTP/SSE, Bearer `MCP_AUTH_TOKEN` |
| `chrome-devtools` | Your Mac (via `npx`) | stdio, local Chrome |

Agent Sam in the dashboard does not embed Chrome DevTools; you combine both in **Cursor** so the same agent can call IAM tools and browser automation tools.

## 1. Copy the example merge

- Tracked template: `docs/cursor-mcp-config.example.json`
- Install path (not committed; gitignored): **project** `.cursor/mcp.json` or **global** `~/.cursor/mcp.json`
- Replace `PASTE_MCP_AUTH_TOKEN_HERE` with the same value as `MCP_AUTH_TOKEN` (see `AGENTS.md` / vault). Never commit the real token.

## 2. Optional: slim + headless

For lighter browser automation only, swap the `chrome-devtools` entry for:

```json
"chrome-devtools": {
  "command": "npx",
  "args": ["-y", "chrome-devtools-mcp@latest", "--slim", "--headless"]
}
```

## 3. Restart Cursor

Reload the window or restart Cursor so new MCP servers register.

## 4. Verify

Settings → MCP: both servers should show as connected (Chrome DevTools may prompt for Chrome on first use if not headless).
