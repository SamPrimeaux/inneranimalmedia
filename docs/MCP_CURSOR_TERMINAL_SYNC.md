# MCP + Cursor + Terminal sync

Quick reference so Cursor (agent), your MCP server, and terminal checks stay aligned.

---

## MCP server (InnerAnimalMedia)

| Item | Value |
|------|--------|
| **Endpoint** | `https://mcp.inneranimalmedia.com/mcp` |
| **Auth** | `Authorization: Bearer <token>` (token in Cursor config only; do not commit). |
| **Required request header** | `Accept: application/json, text/event-stream` (server returns 406 without it). |
| **Protocol** | JSON-RPC 2.0 over HTTP; server can respond with SSE (`event: message`, `data: {...}`). |
| **Server info** | InnerAnimalMedia MCP v1.0.0, protocolVersion 2024-11-05, capabilities: tools (**listChanged: false**). |

**What `listChanged` means:** In MCP, `capabilities.tools.listChanged: true` tells clients the tool list can change at runtime, so some clients poll `tools/list` more often. This server advertises **`false`** because its builtin tool set is static, which reduces unnecessary refreshes. It is not an error and does not mean Cursor is broken.

---

## Cursor config (project)

- **File:** `.cursor/mcp.json` (project root).
- **Server name:** `inneranimalmedia`.
- **Remote HTTP/SSE:** Use `url` plus optional `headers` only. Do **not** set `"transport": { "type": "stdio" }` when `url` points at `https://mcp.inneranimalmedia.com/mcp` — that mix breaks the client and can cause rapid reconnect / log noise.
- **Headers:** Cursor sends the `Authorization` header from config. The MCP client should send `Accept: application/json, text/event-stream` automatically for MCP; no need to set it in `mcp.json`.
- **Restart:** After editing, use **Cmd+Shift+P** → “MCP: Restart Servers” (or restart Cursor).

Current config matches the endpoint and auth above; Cursor and MCP are in sync when this file is unchanged.

---

## Terminal: quick health check

Use this when you want to verify the MCP server from the shell (same as Cursor’s server, with the required `Accept` header):

```bash
curl -s -X POST https://mcp.inneranimalmedia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <same token as .cursor/mcp.json>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

**Success:** You see an SSE line like `data: {... "capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"InnerAnimalMedia MCP","version":"1.0.0"}...}`.

**406 / “Not Acceptable”:** Add or fix the header: `-H "Accept: application/json, text/event-stream"`.

### Use the token from `.cursor/mcp.json` (no typing the secret)

Paste this block as-is (do not add comment lines that start with `#` above `export`; some terminals treat a bad character as the command name `#` and print `zsh: command not found: #`).

```bash
cd ~/Downloads/march1st-inneranimalmedia
export MCP_AUTH="$(node -p "JSON.parse(require('fs').readFileSync('.cursor/mcp.json','utf8')).mcpServers.inneranimalmedia.headers.Authorization")"
curl -sS -X POST 'https://mcp.inneranimalmedia.com/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: $MCP_AUTH" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

If `curl` still prints the same `data: {...}` line as in the manual Bearer example, auth and routing are fine; ignore a one-off `#` error if it came from a stray or non-ASCII `#` line.

---

## Summary

| Layer | Status |
|-------|--------|
| **MCP server** | Live at mcp.inneranimalmedia.com; requires Bearer token + `Accept: application/json, text/event-stream`. |
| **Cursor** | `.cursor/mcp.json` has `inneranimalmedia` with URL and Bearer token; MCP client sends Accept. |
| **Terminal** | Use the curl command above (including the Accept header) to confirm the server from your machine. |

You, your MCP, and your terminal are in sync when: (1) Cursor uses this project’s `.cursor/mcp.json`, (2) the server is up and returns the initialize result, and (3) the same curl from your terminal succeeds.

---

## Repairing a broken MCP connection (401 Invalid token)

If the server returns `401` with `"Invalid token"`, the Bearer token in `.cursor/mcp.json` no longer matches the `MCP_AUTH_TOKEN` secret on the MCP Worker. Repair by syncing to a single new token in both places.

1. **Generate a new token** (run once locally):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Copy the output (e.g. `a1b2c3...`).

2. **Set the token on the MCP Worker** (from this repo):
   ```bash
   cd inneranimalmedia-mcp-server
   ../scripts/with-cloudflare-env.sh npx wrangler secret put MCP_AUTH_TOKEN -c wrangler.toml
   ```
   When prompted, paste the same token. Set the same secret on the **main** Worker if you use MCP invoke proxying (`wrangler.production.toml`).

3. **Update Cursor config** — in `.cursor/mcp.json`, set the `Authorization` header to the same token:
   ```json
   "headers": {
     "Authorization": "Bearer <paste-the-same-token-here>"
   }
   ```

4. **Restart MCP** — In Cursor: **Cmd+Shift+P** → "MCP: Restart Servers" (or restart Cursor).

5. **Verify** — Run the health-check curl from the "Terminal: quick health check" section above, using the new token in the `Authorization` header. You should see SSE output with `serverInfo` and `protocolVersion` instead of 401.
