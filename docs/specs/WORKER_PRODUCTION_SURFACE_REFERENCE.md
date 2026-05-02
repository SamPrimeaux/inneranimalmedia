# Worker `inneranimalmedia` — production surface reference

**Purpose:** Single place for routes/bindings/cron names when wiring dashboard Settings and other UIs.  
**Rule:** Do not store secret values or tokens in this file — names only.

## Domains and routes

| Type | Value |
|------|--------|
| workers.dev | `inneranimalmedia.meauxbility.workers.dev` |
| Preview | `*-inneranimalmedia.meauxbility.workers.dev` |
| Routes | `inneranimalmedia.com/*`, `www.inneranimalmedia.com/*`, `webhooks.inneranimalmedia.com/*` |

## Bindings (names)

- R2: `ASSETS` (inneranimalmedia-assets), `CAD_ASSETS` (splineicons), `DASHBOARD` (agent-sam), `R2` (iam-platform)
- D1: `DB` (inneranimalmedia-business)
- KV: `SESSION_CACHE`, `KV` (MCP_TOKENS)
- DO: `CHESS_SESSION`, `IAM_COLLAB`
- Hyperdrive: `HYPERDRIVE` (Supabase)
- Vectorize: `VECTORIZE`, `VECTORIZE_INDEX`
- Queue: `MY_QUEUE` (+ id variant as configured)
- Browser: `MYBROWSER`
- Analytics Engine: `WAE`

## Cron schedules (verify in dashboard)

- Every 30 minutes
- Daily midnight UTC
- `30 13 * * *` (daily plan email path)
- `0 6 * * *` (maintenance; e.g. webhook_events)
- `0 9 * * *` (additional daily job)

Exact handler mapping lives in `worker.js` `scheduled()`.

## Secret and plaintext env (names only)

AI/providers: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`, `AI_SEARCH_TOKEN`  
Cloudflare: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, images/stream/calls tokens as bound  
Cursor: `CURSOR_API_TOKEN`, `CURSOR_WEBHOOK_SECRET`  
Deploy / internal: `DEPLOY_TRACKING_TOKEN`, `INTERNAL_API_SECRET`, `INTERNAL_WEBHOOK_SECRET`, `WORKER_SECRET`  
GitHub: `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, OAuth client id/secret  
Google OAuth: client id + `GOOGLE_OAUTH_CLIENT_SECRET`  
Billing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`  
Email: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `RESEND_INBOUND_WEBHOOK_SECRET`  
Supabase: `SUPABASE_URL`, keys, `SUPABASE_WEBHOOK_SECRET`, `SUPABASE_DB_PASSWORD`, etc.  
Media/tools: `CLOUDCONVERT_API_KEY`, `MESHYAI_API_KEY`  
Terminal: `PTY_AUTH_TOKEN`, `TERMINAL_SECRET`, `TERMINAL_WS_URL`  
Vault: `VAULT_KEY`, `VAULT_MASTER_KEY`  
Tenant: `TENANT_ID`  
MCP: `MCP_AUTH_TOKEN`  
Realtime: `REALTIME_TURN_API_TOKEN`  
R2 signing: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

## Git → Workers Builds

Repository **not connected** in dashboard as of this note. **Pros:** deploy stays explicit (`npm run deploy` / approved pipeline), fewer surprise prod pushes. **Cons:** no automatic deploy on push; drift between GitHub default branch and Workers version until you deploy.

## Dashboard wiring targets

Settings UI should prefer **existing GET JSON** routes where possible, e.g.:

- `GET /api/webhooks/health` — `webhook_endpoints` + subscription counts
- `GET /api/mcp/tools` — `mcp_registered_tools` (tool list)
- `GET /api/agent/boot` — agents, models, MCP services, sessions (agent shell already uses)
- `/api/env/*` — secrets vault (Settings Environment section)

Add new read-only aggregators only when the worker does not already expose the table.
