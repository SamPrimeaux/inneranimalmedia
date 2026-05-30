# MCP memory tool schema refresh (ChatGPT / Claude connectors)

## Source of truth

| Layer | Table / module | Role |
|-------|----------------|------|
| Catalog SSOT | `agentsam_tools.input_schema` | Authoritative tool definitions |
| MCP mirror | `agentsam_mcp_tools` | Legacy mirror; must stay in sync (migration **470**) |
| Runtime override | `inputSchemaFromAgentsamToolRow` in Worker + `inneranimalmedia-mcp-server` | Canonical JSON Schema even if D1 row is stale |
| Save schema | `src/core/mcp-memory-save-schema.js` | `agentsam_memory_save` — policy/state |
| Vector write | `src/core/mcp-memory-vector-write-schema.js` | `agentsam_memory_write` — `content` + `namespace` only |
| Search schema | `src/core/mcp-memory-search-schema.js` | Optional `memory_type` filter incl. policy/state |

## Which tool to use

| Goal | Tool / API |
|------|------------|
| Private operational memory (D1 + `agentsam.agentsam_memory`) | **`agentsam_memory_save`** or `POST /api/agent/memory/private/upsert` |
| Semantic / Vectorize RAG lane | **`agentsam_memory_write`** (`content` + namespace) or `agentsam_memory_query` |
| Legacy public semantic table | Deprecated — do not use `public.agent_memory` paths |

`agentsam_memory_write` is **not** the normal managed-memory path after migration **470**.

## ChatGPT connector schema refresh

ChatGPT caches `tools/list` aggressively. After D1 migration **470** and MCP server deploy:

1. **Deploy** `inneranimalmedia-mcp-server` (schemas are computed at `tools/list` from D1 + JS overrides).
2. In ChatGPT: **Settings → Connected apps → Inner Animal Media → Disconnect**, then reconnect OAuth.
3. Optional: start a **new chat** so the connector reloads tool definitions.
4. Verify with MCP Inspector or `curl` JSON-RPC `tools/list` on `https://mcp.inneranimalmedia.com/mcp` (Bearer token).
5. Confirm `agentsam_memory_save` → `memory_type.enum` includes `policy` and `state`.
6. Confirm `agentsam_memory_write` → requires `content` (vector), not `key`/`value`.

Main IAM Worker proxies `/mcp` POST to the MCP worker; it does **not** build its own `tools/list` anymore (`src/api/mcp.js`).

## `agentsam_memory_save` execution path (D1 + private PG)

On **`inneranimalmedia-mcp-server`** (not `/api/mcp/dispatch`):

1. **D1** — `executeAgentsamMemoryD1Write` → `agentsam_memory`
2. **Private PG** — `mirrorMcpD1WriteToPrivatePg` via **Hyperdrive** → `agentsam.agentsam_memory`

The old **remote** leg proxied to `/api/mcp/dispatch`, which only authorizes `mcp_dispatch` (agent session routing) — not catalog tool execution — so mirrors failed with `MCP_TOOL_NOT_REGISTERED`. **Save no longer uses that proxy.**

`agentsam_memory_write` still uses the remote leg for Vectorize when `provider` is `cf` / default.

## Temporary type compat (server-side)

If a client cannot send `memory_type: policy|state` yet:

- Send `memory_type: decision` with `tags: ["policy"]` → stored as **policy**
- Send `memory_type: project` with `tags: ["state"]` → stored as **state**

Implementation: `src/core/mcp-memory-type-compat.js` (`resolveManagedMemoryType`).

Opt-in downgrade for legacy-only channels: `resolveManagedMemoryType(input, { legacySchemaOnly: true })`.

## Migrations

- **469** — Added policy/state to `agentsam_tools` (mistakenly also patched `agentsam_memory_write`).
- **470** — Split save vs vector write; sync `agentsam_mcp_tools` mirror.

Apply 470:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
  -c wrangler.production.toml --file=./migrations/470_agentsam_memory_mcp_schema_refresh.sql
```

Deploy MCP server:

```bash
cd ../inneranimalmedia-mcp-server && npm run deploy
```
