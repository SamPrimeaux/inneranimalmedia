# Inner Animal Media

Canonical platform repo for the Inner Animal Media AI agent operating system, Agent Sam, and all associated infrastructure. Cloudflare Workers + D1 + R2 + Vite dashboard.

---

## Canonical Facts (read before anything else)

| Fact | Value |
|------|-------|
| **Local path** | `/Users/samprimeaux/inneranimalmedia` |
| **GitHub** | `https://github.com/SamPrimeaux/inneranimalmedia` |
| **Worker entry** | `src/index.js` (production) |
| **Legacy fallback** | `worker.js` (do not grow — modularize out) |
| **Dashboard app** | `dashboard/` |
| **Dashboard components** | `dashboard/components/` |
| **Deploy (default)** | `npm run deploy:full` |
| **Sandbox** | ❌ Discontinued — do not use `deploy-sandbox.sh` or `promote-to-prod.sh` |

**Never use these paths:**
- `inneranimalmedia-agentsam-dashboard/` — deleted
- `~/Downloads/inneranimalmedia` — gone
- `inneranimalmedia-BARE-DELETE` — deleted
- `march1st-inneranimalmedia` — deleted
- `agent-dashboard/` — never recreate

---

## Repo Layout

```
/Users/samprimeaux/inneranimalmedia/
├── src/
│   ├── index.js          ← Production Worker entry (fetch + scheduled)
│   ├── api/              ← HTTP route handlers by domain
│   ├── core/             ← Auth, crypto, vault, retention, notifications
│   ├── lib/              ← Shared utilities (email, etc.)
│   ├── tools/            ← Agent tool handlers
│   ├── integrations/     ← Third-party integration wrappers
│   └── do/               ← Durable Object implementations
├── dashboard/
│   ├── src/              ← Dashboard app source
│   ├── components/       ← React component source of truth
│   └── dist/             ← Vite build output (generated, do not commit)
├── worker.js             ← Legacy monolith (routing fallback only, phasing out)
├── scripts/              ← Deploy, ingest, notify, and ops scripts
│   └── lib/              ← Shared shell helpers (notify.sh, etc.)
├── migrations/           ← D1 SQL migrations
├── docs/                 ← Operational docs, OAuth parity map
├── db/                   ← Schema notes / helpers
├── analytics/            ← Build manifests, app-builds/
├── wrangler.jsonc        ← Dev config
└── wrangler.production.toml ← Production Worker config
```

---

## Architecture Rules

- `src/index.js` is the only production entry point. `worker.js` is imported as `legacyWorker` for fallback only.
- **All new business logic goes in `src/`** — never add implementation to `worker.js`.
- `worker.js` gets max one import + one route delegation per module. Nothing else.
- When touching any `worker.js` reference: extract logic into `src/` at the same time.
- Bundle size target: `worker.js` import removal will drop bundle from ~4.9MB to target.
- Never hardcode `workspace_id`, `tenant_id`, email addresses, or secret values in source.

---

## Deploy Commands

| Command | When to use |
|---------|-------------|
| `npm run deploy:full` | **Default.** Any `dashboard/` change — Vite build → R2 upload → Worker deploy |
| `npm run deploy` | Worker/API only (`src/`, `worker.js` backend changes only) |
| `./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml` | Worker-only one-liner equivalent |
| `npm run deploy:ingest` | Route map + D1 schema doc + memory ingest + Worker deploy |

**Rules:**
- `npm run deploy:full` loads `.env.cloudflare`, runs `npm run build:vite-only`, uploads `dashboard/dist` to R2 bucket `inneranimalmedia`, deploys with `wrangler.production.toml`, writes build manifest to `analytics/app-builds/`, fires CI/CD email notification if configured.
- GitHub push to `main` triggers CF auto-build for the Worker. It does **not** upload the R2 frontend bundle — run `deploy:full` locally when you need the dashboard live immediately.
- **Never** `cd dashboard` — always run dashboard scripts from repo root.

```bash
# Right
npm run build:vite-only
npm --prefix dashboard install

# Wrong
cd dashboard && npm run build
```

---

## Common Commands

```bash
# Install root deps
npm install

# Install dashboard deps
npm --prefix dashboard install

# Build dashboard
npm run build:vite-only

# Dev dashboard
npm run dev:dashboard

# Preview dashboard
npm run preview:dashboard

# Analyze bundle (open treemap before any lazy-load work)
cd dashboard && npm run build:analyze && open dist/bundle-stats.html
```

---

## Secret Resolution

Secrets resolve at runtime in this order: `vault[key] ?? env[key]`

| Layer | Table / Source | Purpose |
|-------|---------------|---------|
| Platform vault | `env_secrets` (`key_type='encrypted_d1'`) | Encrypted platform secrets, override wrangler |
| Public config | `env_secrets` (`key_type='public_config'`) | Non-sensitive runtime config (e.g. `platform_email_provider`) |
| Registry | `env_secrets` (`key_type='workers_secret'`) | Metadata only — actual value in CF wrangler secrets |
| User vault | `user_secrets` | Per-user encrypted blobs, audited via `secret_audit_log` |
| Wrangler fallback | CF Worker secrets | Used when no vault row exists |

**To rotate a platform secret without code changes:**
```sql
UPDATE env_secrets SET encrypted_value='new_value', updated_at=datetime('now')
WHERE key_name='KEY_NAME' AND key_type='public_config';
```

**Never commit:** `.env.cloudflare`, `.dev.vars`, secrets, `node_modules`, `.wrangler`, `dashboard/dist`

---

## Email Architecture

Two completely separate email paths — never mix them:

**Platform email** (deploys, alerts, system notifications)
- Normal provider: Resend, FROM `*@inneranimalmedia.com`
- Keys: `RESEND_API_KEY`, `RESEND_FROM` (vault ?? env, never hardcoded)
- Fallback (current): `gmail_platform` — switched via D1, zero code change to restore Resend:
  ```sql
  UPDATE env_secrets SET encrypted_value='resend'
  WHERE key_name='platform_email_provider' AND key_type='public_config';
  ```
- All platform email routes through `src/lib/email.js` → `sendPlatformEmail()`
- CI/CD scripts notify via `scripts/lib/notify.sh` → `/api/internal/notify` → `src/core/notifications.js`

**User Gmail** (user-initiated sends via connected Google account)
- Token source: `user_oauth_tokens` WHERE `provider='google'` AND `user_id=?`
- From address: derived from OAuth identity — never injected by platform
- Handled by `sendUserGmail()` in `src/lib/email.js`

---

## Database

**D1 database:** `inneranimalmedia-business` (`cf87b717-d4e2-4cf8-bab0-a81268e32d49`)

### Canonical agentsam_* tables (use these, not legacy names)

| agentsam table | Replaces |
|----------------|---------|
| `agentsam_ai` | `ai_models`, `ai_services` |
| `agentsam_mcp_tools` | `mcp_registered_tools`, `agent_tools` |
| `agentsam_mcp_workflows` | `mcp_workflows`, `ai_workflow_pipelines` |
| `agentsam_mcp_allowlist` | `mcp_server_allowlist` |
| `agentsam_commands` | `commands`, `custom_commands` |
| `agentsam_memory` | `agent_memory_index` |
| `agentsam_plan_tasks` | `agent_tasks`, `tasks` |
| `agentsam_plans` | `agent_execution_plans`, `plans` |
| `agentsam_project_context` | `context_index` |
| `agentsam_usage_events` | `ai_generation_log`, `ai_generation_logs`, `ai_usage_log`, `usage_events` |
| `agentsam_usage_rollups_daily` | `usage_rollups_daily`, `ai_costs_daily` |
| `agentsam_webhook_events` | `webhook_events` ✓, `github_webhook_events` ✓ |
| `agentsam_routing_arms` | `ai_routing_rules`, `model_routing_rules`, `agent_intent_patterns` |
| `agentsam_tool_call_log` | primary tool call telemetry |
| `agentsam_tool_stats_compacted` | `mcp_tool_call_stats` |
| `agentsam_hook` | `hook_subscriptions` |
| `agentsam_hook_execution` | `hook_executions`, `agent_audit_log` |
| `agentsam_command_run` | `agent_command_executions` |
| `agentsam_prompt_versions` | `agent_prompts`, `prompts`, `ai_prompts_library` |
| `agentsam_deployment_health` | `deployment_tracking`, `iam_deploy_log` |
| `agentsam_todo` | `tasks` (hub), `worker_to_do` |
| `agentsam_workspace` | `workspaces`, `tenant_workspaces` |
| `agentsam_workspace_state` | `agent_workspace_state` |
| `agentsam_subagent_profile` | `agent_roles`, `agent_scopes` |
| `agentsam_skill` | `agent_capabilities` |
| `agentsam_rules_document` | `agent_rules`, `agent_policy_templates` |

### Webhook retention policy
`agentsam_webhook_events` has a 7-day TTL. Prune runs via the daily retention cron in `src/core/retention.js`. Weekly rollup goes to `agentsam_webhook_weekly`.

### Key workspace identifiers
| Field | Value |
|-------|-------|
| workspace_id | `ws_inneranimalmedia` |
| tenant_id | `tenant_sam_primeaux` |
| user_id (Sam) | `usr_sam_iam` |

### Retention system (3-layer rollup)
- **Layer 1:** Raw tables, 7–30 day TTL (hot logs)
- **Layer 2:** Daily rollup — `agentsam_usage_rollups_daily`, `agentsam_health_daily`, `workspace_usage_metrics`
- **Layer 3:** Weekly/permanent — `agentsam_webhook_weekly`, `deployments_weekly_rollup`, `spend_ledger_monthly_rollup`
- Cron fires at `00:10 UTC` daily via `src/core/retention.js` → `runMasterDailyRetention()`

---

## Worker Modularization Status

### Verified modular routes (no `X-IAM-Legacy-*` headers)

| Route |
|-------|
| `/api/health` |
| `/auth/login`, `/auth/signup`, `/auth/reset`, `/auth/nope` |
| `/api/oauth/google/start`, `/api/oauth/github/start` |
| OAuth callback missing-state paths |

### Remaining legacy surface

- Real browser Google/GitHub OAuth callback parity — needs browser test
- Generic `/api/*` legacy fallback still present
- `queue(batch, env, ctx)` still calls `legacyWorker.queue`
- `import legacyWorker from '../worker.js'` remains until all calls gone

### Retirement order

1. Run real browser Google + GitHub OAuth login tests
2. Confirm session / cookie / KV / DB / token parity
3. Audit and remove generic `/api/*` legacy fallback
4. Move queue handling into `src/`
5. Remove `import legacyWorker from '../worker.js'`
6. Archive/delete `worker.js` only after bundle/build/deploy passes clean

---

## MCP Server

Separate worker: `inneranimalmedia-mcp-server`  
Endpoint: `https://mcp.inneranimalmedia.com/mcp`  
Secrets must stay in sync with main worker (especially `AGENTSAM_BRIDGE_KEY`, `SUPABASE_WEBHOOK_SECRET`).

---

## PTY / Terminal

- PTY service (`iam-pty`) runs via PM2 on iMac at port 3099
- Tunnel runs on Google VPS (no longer requires iMac terminal open)
- Auth: `AGENTSAM_BRIDGE_KEY` header `X-Bridge-Key` (NOT Authorization Bearer)
- `TERMINAL_SECRET` is separate — used for `x-pty-auth` on fs_ bridge and PTY WebSocket
- Break fix: `read -s CF_TOKEN` → PlistBuddy → `kill -9 $(lsof -ti:3099)` → health check

---

## Supabase (Vector / Memory)

Project: `dpmuvynqixblxsilnlut` (`inneranimalmedia-business-supabase`)  
Hyperdrive: `08183bb9d2914e87ac8395d7e4ecff60`

Vectorized tables (1024-dim, `@cf/baai/bge-large-en-v1.5`):

| Table | Role |
|-------|------|
| `agent_context_snapshots` | Agent context chunks |
| `agent_decisions` | Decision RAG |
| `agent_memory` | Long-term memory |
| `session_summaries` | Session rollups |
| `documents` | General doc store |

Backfill trigger:
```bash
source scripts/lib/notify.sh  # or read -s SUPABASE_WEBHOOK_SECRET
bash scripts/supabase-embeddings-backfill.sh
```

---

## R2 Buckets

| Bucket | Purpose |
|--------|---------|
| `inneranimalmedia` | Dashboard static bundle (`static/dashboard/agent/*`) |
| `iam-platform` | Platform assets |
| `iam-docs` | Documentation |
| `agent-sam` | Agent artifacts |
| `autorag` | AutoRAG chunks |
| `tools` | Tool assets |

Public marketing pages served from R2 ASSETS under `pages/*`.  
Shared header/footer: `src/components/iam-header.html`, `src/components/iam-footer.html` — mirror down before editing.

---

## CI/CD Notifications

Scripts send notifications via `scripts/lib/notify.sh` → `POST /api/internal/notify` → `src/core/notifications.js` → `src/lib/email.js`.

Active events:
- Deploy complete / failed (sandbox discontinued — prod only)
- Frontend deploy + embeddings backfill complete
- Security scan findings (critical severity)
- Approval-required agent proposals

---

## Verification Commands

### Auth routes
```bash
for path in /auth/login /auth/signup /auth/reset /auth/nope; do
  echo "== $path =="
  curl -sD - -o /tmp/iam-check.html "https://inneranimalmedia.com${path}?v=$(date +%s)" \
    | grep -Ei 'http/|content-type|x-iam-route-source|x-iam-legacy' || true
done
```

### OAuth start routes
```bash
curl -sD - -o /tmp/iam-google.html "https://inneranimalmedia.com/api/oauth/google/start?v=$(date +%s)" \
  | grep -Ei 'http/|location|x-iam-route-source|x-iam-legacy' || true
```

### Webhook secret sync check
```bash
npx wrangler secret list --name inneranimalmedia | grep -i webhook
npx wrangler secret list --name inneranimalmedia-mcp-server | grep -i webhook
```

### D1 quick health
```bash
npx wrangler d1 execute inneranimalmedia-business \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agentsam_%' ORDER BY name" \
  --remote | wc -l
```

---

## Current Next Steps

- [ ] Run real browser Google OAuth login test — confirm no `X-IAM-Legacy-*` headers
- [ ] Run real browser GitHub OAuth login test
- [ ] Confirm callback DB/KV/session/token parity
- [ ] Audit and remove generic `/api/*` legacy fallback
- [ ] Replace `legacyWorker.queue` with modular handler in `src/`
- [ ] Remove `import legacyWorker from '../worker.js'`
- [ ] Open `dashboard/dist/bundle-stats.html` — document top 10 bundle contributors before lazy-load refactors
- [ ] Wire `agentsam_webhook_weekly` rollup into daily cron
- [ ] Restore Resend when account unsuspended: `UPDATE env_secrets SET encrypted_value='resend' WHERE key_name='platform_email_provider'`
- [ ] Add `PLATFORM_GMAIL_TOKEN`, `PLATFORM_GMAIL_FROM`, `ALERT_EMAIL` wrangler secrets

---

## Safety Rules

- Do not commit secrets, `.env.cloudflare`, `node_modules`, `.wrangler`, `dashboard/dist`
- Do not force-push over working production history without explicit approval
- Do not delete `worker.js` until `legacyWorker` import is gone and deploy passes clean
- Do not `cd dashboard` — always use `npm --prefix dashboard` from repo root
- Do not hardcode workspace_id, tenant_id, email addresses, or secret values in source
- Sandbox is discontinued — deploy directly to production with `npm run deploy:full`
- Verify `pwd` = `/Users/samprimeaux/inneranimalmedia` before every terminal session

---

*After editing this README:*
```bash
git add README.md
git commit -m "docs: update canonical repo operating plan"
git push origin main
```
