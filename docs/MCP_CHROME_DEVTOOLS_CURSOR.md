# Cursor: InnerAnimal MCP + Chrome DevTools MCP

The Cloudflare **InnerAnimal MCP** (`mcp.inneranimalmedia.com`) and **chrome-devtools-mcp** are different transports:

| Server | Where it runs | Protocol |
|--------|-----------------|----------|
| `inneranimalmedia` | Cloudflare Worker | HTTP/SSE, Bearer `MCP_AUTH_TOKEN` |
| `chrome-devtools` | Your Mac (via `npx`) | stdio, local Chrome |

Agent Sam in the dashboard does not embed Chrome DevTools; you combine both in **Cursor** so the same agent can call IAM tools and browser automation tools.

## 1. Your personal `.cursor/mcp.json` (do not overwrite)

**Never commit or replace** project `.cursor/mcp.json` — it is your local tool config (e.g. `chrome-devtools`, `gemini-api-docs-mcp`).

To add IAM MCP without touching that file:

1. Copy `docs/cursor-mcp-local.example.json` → `.cursor/mcp.local.json` (gitignored), **or**
2. Merge the `inneranimalmedia` block from `docs/cursor-mcp-config.example.json` into your existing `.cursor/mcp.json` by hand.

- Tracked template (docs only): `docs/cursor-mcp-config.example.json`
- Optional local overlay: `.cursor/mcp.local.json` (see example file in repo)
- Replace `PASTE_MCP_AUTH_TOKEN_HERE` / `${CURSOR_MCP_TOKEN}` with your MCP bearer (see `AGENTS.md` / vault). Never commit the real token.

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
