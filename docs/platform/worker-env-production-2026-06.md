# Production Worker config (dashboard snapshot)

**Worker:** `inneranimalmedia` (`wrangler.production.toml`)  
**Recorded:** 2026-06-02 — Cloudflare dashboard after binding cleanup and secret pruning.

## Bindings (dashboard)

| Binding | Type | Resource (dashboard label) |
|---------|------|----------------------------|
| `AGENTSAM_VECTORIZE_CODE` | Vectorize | `agentsam-codebase-oai3large-1536` |
| `AGENTSAM_VECTORIZE_COURSES` | Vectorize | `agentsam-courses-oai3large-1536` |
| `AGENTSAM_VECTORIZE_MEMORY` | Vectorize | `agentsam-memory-oai3large-1536` |
| `AGENTSAM_VECTORIZE_SCHEMA` | Vectorize | `agentsam-schema-oai3large-1536` |
| `AGENT_SESSION` | Durable Object | `inneranimalmedia_AgentChatSqlV1` |
| `BROWSER_SESSION` | Durable Object | `inneranimalmedia_AgentBrowserLiveV1` |
| `AI` | Workers AI | Workers AI Catalog |
| `ASSETS` | R2 | `inneranimalmedia` |
| `AUTORAG_BUCKET` | R2 | `inneranimalmedia-autorag` |
| `CHESS_SESSION` | Durable Object | `inneranimalmedia_ChessRoom` |
| `DASHBOARD` | R2 | `inneranimalmedia` |
| `DB` | D1 | `inneranimalmedia-business` |
| `DOCS_BUCKET` | R2 | `iam-docs` |
| `HYPERDRIVE` | Hyperdrive | `inneranimalmedia-supabase-hyperdrive` |
| `IAM_COLLAB` | Durable Object | `inneranimalmedia_IAMCollaborationSession` |
| `KV` | KV | `MCP_TOKENS` |
| `LOADER` | Dynamic Workers | configured in code |
| `MYBROWSER` | Browser | — |
| `MY_QUEUE` | Queue | `74b3155b36334b69852411c083d50322` |
| `PTY_SERVICE` | VPC Service | `iam-vpc` |
| `SESSION_CACHE` | KV | `production-KV_SESSIONS` |
| `WAE` | Analytics Engine | `inneranimalmedia` |

### Removed from production bindings (2026-06-02)

| Binding | Was | Code impact |
|---------|-----|-------------|
| `VECTORIZE` | `ai-search-inneranimalmedia-autorag` | Integrations health + legacy cron comments; use four-lane indexes or AI Search REST |
| `AGENTSAMVECTORIZE` | `inneranimalmedia-vectors` | **`src/core/agentsam-vectorize.js`** still references this binding — migrate callers to `AGENTSAM_VECTORIZE_*` via `src/core/rag-lanes.js` / `semantic-retrieval-dispatch.js` |
| `R2` | `iam-platform` | **`env.R2`** in agent/cron/r2-api paths; registry may use S3 API + `R2_ACCESS_KEY_*` secrets |
| `TOOLS` | `tools` | `src/api/r2-api.js` bucket map; falls back to `DASHBOARD` when unset |
| `EMAIL` | `inneranimalmedia-email-archive` | **`src/core/r2-email.js`** — templates/archive/sent under `ASSETS` prefix `email/` |
| `AI_SEARCH` | Workers AI Search instance | Never bound in prod; use `AI_SEARCH_ENDPOINT` + `AI_SEARCH_TOKEN` vars |

`wrangler.production.toml` is aligned with the **active** binding list above.

## Plaintext variables (dashboard)

| Name | Value (as configured) | In `wrangler.production.toml` `[vars]` |
|------|------------------------|----------------------------------------|
| `AGENTSAM_EMBEDDING_DIMENSIONS` | `1536` | Yes |
| `AGENTSAM_OPENAI_EMBEDDING_MODEL` | `text-embedding-3-large` | Yes |
| `AI_SEARCH_ENDPOINT` | `https://2da31515-2005-42e4-9efe-a4e6a425a627.search.ai.cloudflare.com` | Yes |
| `CLOUDFLARE_ACCOUNT_ID` | `ede6590ac0d2fb7daf155b35653457b2` | Yes |
| `CLOUDFLARE_IMAGES_ACCOUNT_HASH` | `g7wf09fCONpnidkRnR_5vw` | Yes |
| `DEPLOY_ENV` | `production` | Yes |
| `ENVIRONMENT` | `production` | Yes |
| `GITHUB_CLIENT_ID` | `Ov23li6BZYxjVtGUWibX` | Yes |
| `GOOGLE_CLIENT_ID` | `427617292678-…apps.googleusercontent.com` | Yes |
| `MEET_ENGINE` | `realtimekit` | Yes |
| `OPENAI_API_BASE_URL` | `https://api.openai.com/v1` | Yes |
| `R2_AUTORAG_BUCKET_NAME` | `inneranimalmedia-autorag` | Yes |
| `RAG_AGENT_ID` | `inneranimalmedia` | Yes |
| `RAG_DOCUMENTS_PROJECT_ID` | `inneranimalmedia` | Yes |
| `RAG_OPENAI_EMBEDDING_MODEL` | `text-embedding-3-large` | Yes |
| `SUPABASE_S3_ENDPOINT` | `https://dpmuvynqixblxsilnlut.storage.supabase.co/storage/v1/s3` | Yes |
| `SUPABASE_S3_REGION` | `us-east-2` | Yes |
| `WORKSPACE_ID` | `ws_inneranimalmedia` | Yes |

### Removed from dashboard (still safe at runtime)

| Name | Was in toml | Runtime fallback |
|------|-------------|------------------|
| `TENANT_ID` | Yes (removed from toml 2026-06-02) | Session / D1 `tenant_id` on auth rows; cron uses `'system'` where needed — **do not** re-add as a global default in hot paths |
| `RAG_EMBEDDING_DIMENSIONS` | Yes (removed) | `RAG_SUPABASE_VECTOR_DIM` constant `1024` in `src/api/rag.js` |
| `RAG_AUTORAG_FOLDER_PREFIXES` | Yes (removed) | `knowledge/` default in `resolveAutoragFolder()` |

## Secrets (dashboard — names only)

Grouped for operators; values live only in Cloudflare (and local `.env.cloudflare` for deploy scripts).

| Group | Names |
|-------|--------|
| **Platform / crypto** | `VAULT_MASTER_KEY`, `VAULT_KEY`, `AGENTSAM_BRIDGE_KEY`, `PTY_AUTH_TOKEN`, `AGENT_SESSION_MINT_SECRET`, `INTERNAL_API_SECRET`, `INTERNAL_WEBHOOK_SECRET`, `INGEST_SECRET`, `AUTH_HOOK_SECRET`, `AUTH_HOOK_SECRET_BUC`, `AUTH_HOOK_SECRET_CAT` |
| **OAuth / identity** | `GITHUB_CLIENT_SECRET`, `GITHUB_APP_*`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_CLIENT_SECRET`, `SUPABASE_OAUTH_CLIENT_*`, `SUPABASE_MANAGEMENT_OAUTH_CLIENT_*`, `OIDC_ID_TOKEN_RSA_PRIVATE_KEY`, `MCP_AUTH_TOKEN` |
| **Providers** | `OPENAI_API_KEY`, `OPENAI_WEBHOOK_SECRET`, `ANTHROPIC_*`, `GOOGLE_*`, `GEMINI_API_KEY`, `TAVILY_API_KEY`, `MESHYAI_API_KEY`, `SPLINE_API_KEY`, `CLOUDCONVERT_API_KEY`, `CURSOR_*` |
| **Cloudflare** | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_IMAGES_TOKEN`, `CLOUDFLARE_STREAM_TOKEN`, `CLOUDFLARE_CALLS_*`, `CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN`, `CF_ACCESS_*`, `AI_SEARCH_TOKEN`, `REALTIMEKIT_*`, `REALTIME_TURN_API_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |
| **Supabase** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_DB_*`, `SUPABASE_S3_*`, `SUPABASE_WEBHOOK_SECRET`, `SUPABASE_DB_WEBHOOK_SECRET` |
| **Comms / billing** | `RESEND_*`, `STRIPE_*`, `GMAIL_DELEGATED_USER` |
| **Comms (removed)** | ~~`BLUEBUBBLES_URL`~~, ~~`BLUEBUBBLES_PASSWORD`~~ — dropped from worker; iMessage bridge degraded (see below) |
| **Deploy / CI** | `AGENT_SAM_DEPLOY_HOOK_URL`, `DEPLOY_TRACKING_TOKEN`, `IAM_ENABLE_E2E_TEST_ROUTES`, `IAM_TEST_SECRET` |
| **Terminal / SSH** | `TERMINAL_SECRET`, `TERMINAL_WS_URL`, `SSH_TARGETS_JSON` |
| **Misc** | `AGENTSAMGPT_SERVICEKEY`, `SHINSHU_MCP_SECRET`, `POLICY_AUD`, `TEAM_DOMAIN`, `OPENSCAD_ENABLED`, `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET` |

## Worker entry (what it is)

| Field | Value |
|-------|--------|
| **Worker name** | `inneranimalmedia` (`wrangler.production.toml` → `name`) |
| **Entry module** | **`src/index.js`** (`main = "src/index.js"`) |
| **Role** | Single `fetch` / `scheduled` / queue handler: auth, dashboard gate, `ASSET_ROUTES`, `/api/*` dispatch, crons |

There is **no** root `worker.js` (removed). The MCP host at `mcp.inneranimalmedia.com` is a **separate** Worker/repo — not this entry.

## Drift / action items

### `TOKEN_SIGNING_KEY` — required for HMAC MCP workspace tokens

**Binding:** Wrangler secret on **`inneranimalmedia`** only (not committed, not in `[vars]`).

**Provision (generates 32-byte key, uploads via API, never prints value):**

```bash
./scripts/ensure-token-signing-key.sh          # set if missing
./scripts/ensure-token-signing-key.sh --check  # verify name is registered
./scripts/ensure-token-signing-key.sh --force  # rotate (breaks existing HMAC bearers)
```

| Path | Behavior |
|------|----------|
| **Mint** (`generateMcpToken`) | Signs `{base64Payload}.{hmac}`; inserts **`mcp_workspace_tokens.token_hash`** = HMAC hex only (raw bearer shown once) |
| **Validate** dotted bearer | Recomputes HMAC with `TOKEN_SIGNING_KEY`, checks D1 row by `jti` |
| **Legacy** tokens (no `.`) | SHA-256 hash of raw bearer — independent of this secret |
| **OAuth MCP** | Does **not** use `TOKEN_SIGNING_KEY` |

(`AGENT_SESSION_MINT_SECRET` is separate — agent session mint in `src/api/auth.js`.)

### BlueBubbles — `BLUEBUBBLES_URL` / `BLUEBUBBLES_PASSWORD` dropped (feature degraded)

| Capability | Secret / binding | Status if dropped |
|------------|------------------|-------------------|
| **Outbound iMessage** (send, list chats, agent tool `imessage`) | `BLUEBUBBLES_URL`, `BLUEBUBBLES_PASSWORD` | **Broken** — `src/integrations/bluebubbles.js` throws *configuration missing* |
| **Inbound webhook** → Agent | `BLUEBUBBLES_WEBHOOK_SECRET` (if still set) | Webhook route can still **receive**; reply/send paths that call `sendMessage` still need URL/password |
| **Security alerts via iMessage** | `keys-security.js` → `sendBlueBubblesMessage` | **Skipped** when `BLUEBUBBLES_URL` unset |
| **Integrations UI** | `int_bluebubbles` row | Shows **disconnected** (`src/api/integrations.js`) |

Treat iMessage/BlueBubbles as **intentionally off** until URL + password are restored on this worker (or code is gated/removed).

### Other secrets to keep if features are on

| Secret | Used by |
|--------|---------|
| `VAULT_MASTER_KEY` | `user_secrets`, OAuth token encryption |
| `PTY_AUTH_TOKEN` | Terminal bridge |
| `AGENTSAM_BRIDGE_KEY` | Telemetry / bridge ingest |

### AI Search

- `[[ai_search]]` binding is **commented out** in `wrangler.production.toml`.
- Dashboard has **`AI_SEARCH_ENDPOINT`** (plaintext) + **`AI_SEARCH_TOKEN`** (secret) — REST path, not the Workers AI Search binding.

### Identity vars

- **`WORKSPACE_ID`** remains a platform plaintext var (wrangler + dashboard).
- **`TENANT_ID`** intentionally **not** in dashboard; per-user `tenant_id` comes from session/D1, not a Worker default.

## Deploy hygiene

- **`npm run deploy:full`** deploys the Worker from git; `[vars]` in `wrangler.production.toml` are pushed on deploy — keep toml aligned with this doc.
- **Secrets** are not in git; manage via dashboard or `wrangler secret put` / `wrangler secret list`.
- **Auth HTML** (`pages/auth/*`) is R2-only; use `./scripts/upload-auth-pages.sh` (no Worker redeploy).

## Refresh inventory

```bash
./scripts/with-cloudflare-env.sh npx wrangler secret list -c wrangler.production.toml
# Vars: Cloudflare dashboard → Workers → inneranimalmedia → Settings → Variables
```
