# MCP Server — GitHub Repo & Cloudflare Audit / Technical Overview

**Document:** Company audit and technical overview of the standalone MCP server (GitHub + Cloudflare Workers).  
**Date:** 2026-03-18  
**Owner:** Inner Animal Media / Agent Sam platform.

---

## 1. Purpose and scope

The **Inner Animal Media MCP Server** is a dedicated Cloudflare Worker that implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) over HTTP. It provides a stable, versioned API for Cursor, Agent Sam, and other clients to call tools (D1, R2, terminal, knowledge search stub, clients, worker services) without coupling that logic to the main platform Worker.

- **GitHub repo:** [SamPrimeaux/inneranimalmedia-mcp-server](https://github.com/SamPrimeaux/inneranimalmedia-mcp-server)
- **Production URL:** `https://mcp.inneranimalmedia.com`
- **MCP endpoint:** `https://mcp.inneranimalmedia.com/mcp`

---

## 2. Architecture summary

| Layer | Technology |
|-------|------------|
| Repo | Single-purpose GitHub repo; `main` branch is production source. |
| Runtime | Cloudflare Workers (ES modules, Node compatibility). |
| Deploy | Cloudflare Git integration: push to `main` triggers `npx wrangler deploy`. |
| Config | `wrangler.jsonc` (Worker name, routes, bindings). No secrets in repo. |
| Auth | Bearer token; secret `MCP_AUTH_TOKEN` set in Cloudflare dashboard only. |

---

## 3. Repository layout

```
inneranimalmedia-mcp-server/
  .github/              # (optional) workflows — e.g. manual deploy
  src/
    index.js            # Worker entry: fetch (MCP + dashboard), queue (stub)
    dashboard-html.js   # Embedded HTML for / and /dashboard (MCP UI)
  package.json          # name, scripts (dev, deploy), wrangler@^4.75.0
  wrangler.jsonc        # Worker config: routes, D1, R2, KV, AI, Vectorize, Browser, Queue
  README.md             # Protocol, auth, tools, deploy, health check
  .gitignore            # node_modules, .wrangler, .env, etc.
```

- **Build command:** None (Cloudflare runs `npm clean-install` then `npx wrangler deploy`).
- **Wrangler version:** 4.75.0 (pinned in package.json so CI uses a known version).

---

## 4. Cloudflare configuration

### 4.1 Worker identity

- **Worker name:** `inneranimalmedia-mcp-server`
- **Entry point:** `src/index.js` (default export with `fetch` and `queue`).

### 4.2 Routes

- **Custom domain:** `mcp.inneranimalmedia.com` (no path, no wildcard — custom domains do not support `*` or paths in the pattern).
- **Served paths:**
  - `GET /` and `GET /dashboard` → HTML dashboard (from `DASHBOARD_HTML`).
  - `POST /mcp` → MCP JSON-RPC (initialize, tools/list, tools/call).

### 4.3 Bindings (production)

| Binding | Type | Resource |
|--------|------|----------|
| `DB` | D1 | `inneranimalmedia-business` (database_id: cf87b717-d4e2-4cf8-bab0-a81268e32d49) |
| `R2` | R2 Bucket | `iam-platform` |
| `ASSETS` | R2 Bucket | `inneranimalmedia-assets` |
| `MCP_TOKENS` | KV | id 09438d5e4f664bf78467a15af7743c44 |
| `SESSION_CACHE` | KV | id dc87920b0a9247979a213c09df9a0234 |
| `AI` | Workers AI | — |
| `VECTORIZE` | Vectorize | `ai-search-inneranimalmedia-aisearch` |
| `MYBROWSER` | Browser | — |
| `MY_QUEUE` | Queue (producer) | queue id 74b3155b36334b69852411c083d50322 |

**Note:** The Worker is a **queue producer only**; the `queues.consumers` block was removed to satisfy Cloudflare’s “queue handler” requirement (consumer can be a separate worker later).

### 4.4 Secrets (not in GitHub)

Set in Cloudflare Dashboard → Workers & Pages → inneranimalmedia-mcp-server → Settings → Variables and secrets:

- **MCP_AUTH_TOKEN** — Required. Bearer token for all requests to `/mcp`. Must match value used by Cursor and other MCP clients.
- **PTY_AUTH_TOKEN** — Optional. Used by `terminal_execute` to call the terminal service at `https://terminal.inneranimalmedia.com/exec`.

Rotate tokens via Dashboard or:

```bash
cd ~/inneranimalmedia-mcp-server
npx wrangler secret put MCP_AUTH_TOKEN   # paste new token when prompted
```

---

## 5. MCP protocol details

- **Protocol version:** `2024-11-05`
- **Transport:** HTTP POST; response `Content-Type: text/event-stream`; body lines: `data: <JSON>`.
- **Auth:** `Authorization: Bearer <MCP_AUTH_TOKEN>`. Missing or invalid token returns `401` with `{"error":"Unauthorized","message":"..."}`.
- **Required request header:** `Accept: application/json, text/event-stream` (otherwise 406).

### 5.1 Methods implemented

| Method | Description |
|--------|-------------|
| `initialize` | Returns protocolVersion, capabilities (tools.listChanged), serverInfo (name: "InnerAnimalMedia MCP", version: "1.0.0"). |
| `tools/list` | Returns list of tool definitions (name, description, inputSchema). |
| `tools/call` | Executes a tool by name with `arguments`; returns content array (text). |

### 5.2 Tools exposed

| Tool | Purpose | Bindings / notes |
|------|---------|------------------|
| `r2_write` | Write object to R2 | R2 (key, body; optional contentType). |
| `r2_read` | Read object from R2 | R2 (key). |
| `r2_list` | List R2 keys with optional prefix | R2 (prefix; limit 50). |
| `d1_query` | Run SELECT on D1 | DB (query; SELECT only). |
| `d1_write` | Run INSERT/UPDATE/DELETE on D1 | DB (sql; optional params array). |
| `terminal_execute` | Run shell command via terminal service | PTY_AUTH_TOKEN, fetch to terminal.inneranimalmedia.com. |
| `knowledge_search` | Stub | Returns placeholder; real implementation in main worker. |
| `list_clients` | List clients from D1 | DB; query uses `name as display_name`, `email as primary_email`, `ORDER BY name`. |
| `get_worker_services` | List worker services by client_id or client_slug | DB (worker_services + clients). |
| `get_deploy_command` | Get deploy hint for a worker name | DB (worker_services). |

---

## 6. Health check and validation

**Basic reachability (no auth):**

```bash
curl -s https://mcp.inneranimalmedia.com/ -H "Accept: application/json"
# Expect JSON: service, status, mcp_endpoint, auth.
```

**MCP initialize (with auth):**

```bash
export MCP_AUTH_TOKEN='<your-token>'
curl -s -X POST https://mcp.inneranimalmedia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
# Expect SSE line: data: {"jsonrpc":"2.0","id":1,"result":{...}}
```

**List tools:**

```bash
curl -s -X POST https://mcp.inneranimalmedia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

---

## 7. Cursor integration

- **MCP server URL:** `https://mcp.inneranimalmedia.com/mcp`
- **Auth:** Bearer token stored in Cursor MCP config (e.g. `.cursor/mcp.json`). Token must match `MCP_AUTH_TOKEN` on the Worker.
- **Reference:** See `.cursor/rules/mcp-reference.mdc` in the main platform repo for canonical endpoint and health-check command.

---

## 8. Deployment and CI

- **Production deploy:** Cloudflare Git integration builds on push to `main` (install deps, `npx wrangler deploy`). No manual deploy required unless Git integration is disconnected.
- **Local deploy:** From repo root, `npx wrangler deploy` (requires Wrangler auth and same account). Do not deploy without explicit approval per company rules.
- **Secrets:** Configured only in Cloudflare; never commit tokens to GitHub. For local curl tests, `export MCP_AUTH_TOKEN='...'` in the same shell.

---

## 9. Known limitations and next steps

- **Dashboard UI:** Root/dashboard HTML is embedded in `dashboard-html.js`; it has had regex/CSS issues. Alternative: proxy the canonical R2-hosted page (`https://pub-b845a8f899834f0faf95dc83eda3c505.r2.dev/static/dashboard/mcp.html`) from the Worker for a clean UI.
- **knowledge_search:** Stub only; real implementation lives in the main platform Worker (AutoRAG/Vectorize).
- **Queue consumer:** This Worker is producer-only; a separate consumer worker can be added later if needed.
- **Token mismatch:** If clients get "Invalid token", ensure the secret is set on the Worker **inneranimalmedia-mcp-server** (not the main **inneranimalmedia** Worker) and that clients use the same value (e.g. export in shell for curl, or update Cursor MCP config).

---

## 10. Change log (high level)

| Date | Change |
|------|--------|
| 2026-03-18 | Repo created; MCP endpoint, dashboard HTML, wrangler 4.75.0; custom domain route fixed (no wildcard); queue producer-only; list_clients query fixed (name/email columns). |

---

*End of audit. For runbooks and day-to-day ops, see README in the repo and the main platform’s `docs/cursor-session-log.md`.*
