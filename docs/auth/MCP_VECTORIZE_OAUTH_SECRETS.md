# MCP vectorize + OAuth — secrets that actually matter

**Symptom:** ChatGPT / Claude.ai OAuth connects but `vectorize_query`, `vectorize_upsert`, or `agentsam_vectorize_describe` fail after rotating `INTERNAL_API_SECRET`.

**Why rotating `INTERNAL_API_SECRET` alone did not fix it**

| Secret | Used for | OAuth ChatGPT/Claude? |
|--------|----------|------------------------|
| `INTERNAL_API_SECRET` | IAM ↔ MCP **internal** HTTP (`/api/internal/*`), deploy hooks, some bridge calls | **No** — not your OAuth bearer |
| `AGENTSAM_BRIDGE_KEY` | Deploy email (`/api/email/send`), telemetry bridge, fallback internal auth | **No** |
| `MCP_AUTH_TOKEN` | Cursor/static bearer → `mcp.inneranimalmedia.com` | **No** (unless you paste it manually) |
| `mcp_oauth_*` bearer | OAuth consent → `mcp_workspace_tokens` | **Yes** |

Deploy notifications still work because `scripts/deploy-frontend.sh` prefers **`AGENTSAM_BRIDGE_KEY`**, then `INTERNAL_API_SECRET` — not because OAuth is fixed.

## Automated rotation (recommended)

One script rotates **both** secrets in order (bridge → internal), pushes to **both** workers, updates D1, and rewrites `.env.cloudflare`:

```bash
cd /Users/samprimeaux/inneranimalmedia
bash scripts/rotate-iam-mcp-platform-secrets.sh          # prompts
bash scripts/rotate-iam-mcp-platform-secrets.sh --dry-run
npm run rotate:platform-secrets -- --force               # skip prompt
```

Underlying tool: `scripts/rotate_bridge_key.py` (`--platform-pair`). Also:

| Command | What rotates |
|---------|----------------|
| `npm run rotate:bridge` | `AGENTSAM_BRIDGE_KEY` only → `mcp_workspace_tokens` + both workers |
| `npm run rotate:internal` | `INTERNAL_API_SECRET` only → `secret_audit_log` + both workers |
| `python3 scripts/rotate_bridge_key.py --all` | Bridge + `AGENT_SESSION_MINT_SECRET` (legacy) |

**Does not** rotate `OPENAI_API_KEY` — set on MCP worker manually after the pair run.

Legacy one-shot (IAM worker only, hardcoded token row): `scripts/setup_mcp_bridge.py` — prefer `rotate_bridge_key.py`.

## Manual sync (if you already have values)

### 1. `inneranimalmedia` (main IAM worker)

```bash
cd /Users/samprimeaux/inneranimalmedia
./scripts/with-cloudflare-env.sh npx wrangler secret put INTERNAL_API_SECRET -c wrangler.production.toml
./scripts/with-cloudflare-env.sh npx wrangler secret put AGENTSAM_BRIDGE_KEY -c wrangler.production.toml
```

### 2. `inneranimalmedia-mcp-server` (MCP worker)

```bash
cd /Users/samprimeaux/inneranimalmedia-mcp-server
/Users/samprimeaux/inneranimalmedia/scripts/with-cloudflare-env.sh npx wrangler secret put INTERNAL_API_SECRET -c wrangler.jsonc
/Users/samprimeaux/inneranimalmedia/scripts/with-cloudflare-env.sh npx wrangler secret put AGENTSAM_BRIDGE_KEY -c wrangler.jsonc
/Users/samprimeaux/inneranimalmedia/scripts/with-cloudflare-env.sh npx wrangler secret put OPENAI_API_KEY -c wrangler.jsonc
```

**Rule:** `INTERNAL_API_SECRET` and `AGENTSAM_BRIDGE_KEY` must be the **same plaintext** on both workers (pick one value per secret name).

List names only (no values):

```bash
npx wrangler secret list -c wrangler.production.toml   # IAM
npx wrangler secret list -c wrangler.jsonc              # MCP
```

## Vectorize-specific production requirements (2026-05-28)

1. **MCP `wrangler.jsonc`** must declare `AGENTSAMVECTORIZE` (and lane indexes), not only legacy `VECTORIZE` @1024.
2. **MCP `handleAI`** must implement `operation: query|upsert` for `vectorize_query` / `vectorize_upsert` catalog rows.
3. **`OPENAI_API_KEY`** on the **MCP worker** for 1536-dim embeddings (`text-embedding-3-large`).
4. **OAuth reconnect** after deploy — old `mcp_oauth_*` tokens keep stale `allowed_tools` until re-consent.

## Supabase pgvector lanes (AutoRAG tables)

**Discover lanes** (no Hyperdrive required — reads D1 `agentsam_pgvector_lane_registry`):

```bash
# MCP OAuth bearer
curl -sS -X POST https://mcp.inneranimalmedia.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"agentsam_vectorize_describe","arguments":{"tier":"supabase"}}}'
```

**Search a lane** (`supabase_vector` — requires **HYPERDRIVE** on MCP worker + `OPENAI_API_KEY`):

```bash
curl -sS -X POST https://mcp.inneranimalmedia.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"supabase_vector","arguments":{"purpose":"database_schema","query":"agentsam_workflow_handlers columns","limit":5}}}'
```

| Purpose | Table | Typical rows | Notes |
|---------|--------|--------------|--------|
| `memory` | `agentsam_memory_oai3large_1536` | ~17 | Agent semantic memory |
| `documents` | `agentsam_documents_oai3large_1536` | ~265 | Courses / docs |
| `database_schema` | `agentsam_database_schema_oai3large_1536` | ~593 | **Use this** for schema RAG |
| `schema` | `agentsam_schema_oai3large_1536` | ~9 | **Inactive in D1 registry** (duplicate) |
| `codebase_chunks` | `agentsam_codebase_chunks_oai3large_1536` | 0 | Run codebase reindex to populate |
| `deep_archive` | `agentsam_deep_archive_oai3large_3072` | few | **3072-dim** queries only |

After MCP deploy, health should show `bindings.hyperdrive: true`.

Migration `444_pgvector_lane_schema_dedup_mcp_supabase.sql` deactivates the duplicate `schema` lane row.

## Verify

```bash
# OAuth bearer from https://mcp.inneranimalmedia.com/auth/connect
export TOKEN="mcp_oauth_…"

curl -s -X POST https://mcp.inneranimalmedia.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"agentsam_vectorize_describe","arguments":{}}}' \
  | head -c 800

curl -s -X POST https://mcp.inneranimalmedia.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"vectorize_query","arguments":{"query":"agentsam workflow registry","limit":3}}}' \
  | head -c 1200
```

Expect JSON with `"ok": true`, not `Unknown AI operation: query` or `binding AGENTSAMVECTORIZE not configured`.

## D1 allowlist (already includes vectorize)

`agentsam_mcp_oauth_tool_allowlist` for `iam_mcp_inneranimalmedia` includes: `vectorize_query`, `vectorize_upsert`, `agentsam_vectorize_describe`, `knowledge_search`, `rag_search`, `workspace_search_semantic`, etc.

After OAuth reconnect, confirm token tools:

```sql
SELECT allowed_tools FROM mcp_workspace_tokens
WHERE token_type = 'oauth' AND COALESCE(is_active,1)=1
ORDER BY created_at DESC LIMIT 1;
```
