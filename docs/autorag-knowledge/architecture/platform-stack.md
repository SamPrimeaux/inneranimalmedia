# Inner Animal Media platform stack (production)

Source: `wrangler.production.toml`, `worker.js` header comments, and operational scripts.

## Worker

- **Name:** `inneranimalmedia`
- **Entry:** `worker.js`
- **Compatibility:** `2026-01-20`, `nodejs_compat`
- **Routes:** `inneranimalmedia.com/*`, `www.inneranimalmedia.com/*`, `webhooks.inneranimalmedia.com/*`
- **Cron triggers:** `0 6 * * *` (RAG/knowledge sync), `30 13 * * *` (daily plan email), `0 9 * * *` (FinancialCommand stub), `*/30 * * * *` (queue + overnight progress), `0 0 * * *` (daily digest)

## Bindings (wrangler.production.toml)

| Binding | Resource |
|---------|----------|
| AI | Workers AI |
| AI_SEARCH | AI Search instance **`iam-autorag`** |
| MYBROWSER | Browser Rendering |
| ASSETS | R2 `inneranimalmedia-assets` |
| CAD_ASSETS | R2 `splineicons` |
| DASHBOARD | R2 **`agent-sam`** (dashboard static) |
| R2 | R2 **`iam-platform`** (memory/logs style content) |
| DB | D1 **`inneranimalmedia-business`** (id `cf87b717-d4e2-4cf8-bab0-a81268e32d49`) |
| HYPERDRIVE | Config id `08183bb9d2914e87ac8395d7e4ecff60` (Supabase) |
| VECTORIZE | Index `ai-search-inneranimalmedia-aisearch` |
| VECTORIZE_INDEX | Index **`ai-search-iam-autorag`** (AutoRAG-related) |
| KV | Namespace `09438d5e4f664bf78467a15af7743c44` |
| SESSION_CACHE | Namespace `dc87920b0a9247979a213c09df9a0234` |
| IAM_COLLAB | Durable Object `IAMCollaborationSession` |
| CHESS_SESSION | Durable Object `ChessRoom` |
| MY_QUEUE | Queue `74b3155b36334b69852411c083d50322` (producer + consumer) |
| WAE | Analytics Engine dataset `inneranimalmedia` |

## Plaintext vars (non-secret)

- `CLOUDFLARE_ACCOUNT_ID` (example value in repo toml: `ede6590ac0d2fb7daf155b35653457b2`)
- `CLOUDFLARE_IMAGES_ACCOUNT_HASH`
- `GITHUB_CLIENT_ID`, `GOOGLE_CLIENT_ID`
- `TENANT_ID` default `tenant_sam_primeaux`

Secrets (names only): include `AI_SEARCH_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `CLOUDFLARE_API_TOKEN`, `INTERNAL_API_SECRET`, `TERMINAL_SECRET`, `TERMINAL_WS_URL`, OAuth client secrets, `MCP_AUTH_TOKEN`, `PTY_AUTH_TOKEN`, `VAULT_MASTER_KEY`, R2 keys, Resend, Stream/Images tokens, etc. (see `worker.js` env inventory helper around lines 12455+).

## R2 buckets and roles

| Bucket | Role |
|--------|------|
| **agent-sam** | Dashboard HTML/CSS/JS, `static/dashboard/*`, worker source mirror keys, screenshots paths as used by worker |
| **inneranimalmedia-assets** | Public site assets |
| **splineicons** | CAD assets |
| **iam-platform** | Platform memory / logs (not dashboard shell) |
| **autorag** | AutoRAG / AI Search **ingest** bucket (this knowledge upload targets `knowledge/*` prefix here) |

## D1 (key tables — non-exhaustive)

- **Agent:** `agent_sessions`, `agent_conversations`, `agent_messages`, `agent_telemetry`, `mcp_registered_tools`, `mcp_tool_calls`, `ai_models`, `agent_memory_index`, `ai_knowledge_base`, `ai_compiled_context_cache`, `context_search_log`
- **Ops:** `deployments`, `deployment_changes`, `dashboard_versions`, `playwright_jobs`, `playwright_jobs_v2`, `cloudflare_deployments`
- **Spend / time:** `spend_ledger`, `project_time_entries`, unified spend views
- **Users / auth:** `auth_users`, `user_oauth_tokens`, `agentsam_user_policy`, `agentsam_fetch_domain_allowlist`

## KV

- **SESSION_CACHE:** OAuth state and session-related ephemeral data (OAuth architecture rule: `connectDrive` / `connectGitHub` flags).
- **KV:** General key-value (e.g. browser screenshot cache keys under `/api/browser/screenshot`).

## Cloudflare services in use

Workers, D1, R2, KV, Queues, Durable Objects, AI (Workers AI), AI Search (AutoRAG instance `iam-autorag`), Vectorize (two indexes), Browser Rendering (Playwright), Hyperdrive, Analytics Engine, Images (delivery URLs in dashboard HTML), Cron Triggers, Tail consumer (`inneranimalmedia-tail`).

## Deploy pipeline

- **Worker (production):** `./scripts/with-cloudflare-env.sh npx wrangler deploy --config wrangler.production.toml`
- **Tracked deploy + dashboard assets:** `./scripts/deploy-with-record.sh` — bumps `dashboard/agent.html` `?v=`, uploads `agent-dashboard.js` / `.css` / `agent.html` to **agent-sam**, inserts `dashboard_versions` rows, optional incremental `docs/*.md` to R2, runs wrangler deploy, times deploy, `./scripts/post-deploy-record.sh` for `deployments` table.
- **D1 deploy row only:** `./scripts/post-deploy-record.sh` with `CLOUDFLARE_VERSION_ID`, `TRIGGERED_BY`, `DEPLOYMENT_NOTES`, `DEPLOY_SECONDS`.
- **API deploy log:** `POST /api/deployments/log` with bearer `DEPLOY_TRACKING_TOKEN` / `WORKER_SECRET` (`scripts/deploy.sh`).

## Asset versioning (`?v=` cache bust)

- `dashboard/agent.html` references `/static/dashboard/agent/agent-dashboard.js?v=N` and `.css?v=N`.
- `deploy-with-record.sh` auto-increments N before R2 upload.
- D1 `dashboard_versions` stores file hashes and sizes per page (agent, agent-css, agent-html).

## Observability

- Wrangler `observability.logs` and `observability.traces` enabled with head sampling.
- OTLP ingest: `POST /api/telemetry/v1/traces` writes `otlp_traces`.
