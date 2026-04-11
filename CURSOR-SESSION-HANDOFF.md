# IAM Platform — Claude Session Handoff
## April 11, 2026

---

## What this is

InnerAnimalMedia (IAM) is a Cloudflare-native SaaS platform and web agency tool
built and operated solo by Sam Primeaux. Stack: Cloudflare Workers, D1, R2, KV,
Durable Objects, Workers AI, MCP server. Frontend: Vite/React dashboard.

Active repo: github.com/SamPrimeaux/inneranimalmedia (clean remaster, started today)
Old broken repo: github.com/SamPrimeaux/inneranimalmedia-agentsam-dashboard (DO NOT reference)
Local path: ~/inneranimalmedia
Sandbox worker: inneranimal-dashboard.meauxbility.workers.dev
Prod worker: inneranimalmedia (inneranimalmedia.com)

---

## What was completed this session

A clean repo was scaffolded from scratch. The following files were manually
placed into the new repo today, all rebuilt to production quality:

### Config
- wrangler.jsonc (sandbox config)
- wrangler.production.toml (prod config)
- package.json

### Worker entrypoint
- worker.js (monolith, still needed as legacyWorker during modular extraction)

### src/integrations/
- anthropic.js — full Anthropic SDK integration, DB-driven via ai_models table,
  zero hardcoded model strings. Exports: chatWithAnthropic, streamWithAnthropic,
  countTokens, createAnthropicBatch, getBatchResult, cancelBatch, listBatches,
  buildSystemWithMemory, trimHistory

### src/tools/
- time.js — temporal awareness tool. Exports: handleTimeDispatch (HTTP),
  getCurrentTimeContext(tz), getTemporalSnapshot(tz). Inject agent_context
  string into system prompts for realtime awareness.
- terminal.js — PTY shell execution tool. Auth via PTY_AUTH_TOKEN → TERMINAL_SECRET
  fallback. HTTP /exec primary, WebSocket fallback. Exports: handlers object +
  definitions array (Anthropic tool_use schema). Tools: run_command, run_script,
  get_workspace, git_status, git_log, check_binary, env_info, kill_session

### src/api/
- auth.js — user authentication routes
- agent.js — agent Sam endpoints
- agentsam.js — agent management service
- cicd.js — user-facing CI/CD pipeline API (handleCicdApi). Routes: GET /current,
  GET /runs, POST /run. Reads SANDBOX_ORIGIN from env, no hardcoded URLs.
- cicd-event.js — internal deploy lifecycle webhook (handleCicdEvent). Called by
  shell scripts, auth via INTERNAL_API_SECRET header. Events: post_promote,
  post_sandbox, session_start, session_end. All tenant/project/URL values read
  from env helpers (tenantId, projectId, deployUser, iamOrigin, sandboxOrigin).
- git-status.js — GET /api/internal/git-status. Reads workspace root from D1
  workspace_settings, runs git branch/status/log in parallel via Promise.all.
- integrations.js — external webhook receiver (handleIntegrationsRequest).
  BlueBubbles + Resend. Both verify secrets, both fire triggerAgentReasoning
  via ctx.waitUntil after storing messages. No more stub comments.
- mcp.js — MCP session/tool management (handleMcpApi). Agents loaded from
  agentsam_ai WHERE is_active=1, no hardcoded agent IDs. Tool filtering reads
  tool_permissions_json from agent row. Added /api/mcp/invoke endpoint.
- integrity.js — system health snapshots (handleIntegrityApi + runIntegritySnapshot).
  Routes: POST /snapshot, GET /latest, GET /history. Thresholds configurable via
  env vars (INTEGRITY_RD_UNKNOWN_MODEL_MAX etc). Callable from cron or HTTP.
- overview.js — dashboard analytics (handleOverviewApi). Routes: /activity-strip,
  /deployments, /stats. Fixed: queries cicd_pipeline_runs not old cicd_runs name.
  /stats now returns platform_health from latest integrity snapshot.

### src/core/
- auth.js (identity/session layer)
- terminal.js (PTY execution, WS fallback, history logging to D1)

---

## Scaffold structure (locked, do not add directories outside this)

```
src/
  core/       router.js, responses.js, auth.js, session.js, d1.js, r2.js,
              notifications.js, terminal.js, themes.js, durable_objects.js
  api/        one file per route group (see above)
  tools/
    builtin/  one file per tool function (agent.js, anthropic-batch.js, etc)
  integrations/ anthropic.js, bluebubbles.js, gemini.js, github.js, openai.js,
                resend.js, tokens.js, vertex.js, workers-ai.js, playwright.js,
                canvas.js, hyperdrive.js
  middleware/ cors.js, rateLimit.js, logging.js
  do/         AgentChat.js, Collaboration.js, Legacy.js
dashboard/
  app/        Vite/React frontend (App.tsx, components/, services/, utils/)
  pages/      static HTML shells
scripts/
  benchmark-full.sh
  promote-to-prod.sh
.github/
  workflows/  sandbox.yml, staging.yml, production.yml (not yet written)
```

---

## Key non-negotiables (enforce these always)

1. jsonResponse always imported from ../core/responses.js — never from auth.js
2. No hardcoded model strings — all capability flags from ai_models D1 table
3. No hardcoded tenant IDs, project IDs, URLs, email addresses — all from env
4. No TODO stubs — if you can't finish it, don't start it
5. No new directories outside the scaffold above
6. No duplicate components — extend what exists
7. Surgical edits only — never rewrite whole files without being asked
8. Always audit schema with PRAGMA table_info before writing SQL
9. Never touch wrangler.production.toml or OAuth handlers without explicit approval
10. worker.js is the legacy monolith — extract from it, never modify it directly

---

## D1 database

Name: inneranimalmedia-business
ID: cf87b717-d4e2-4cf8-bab0-a81268e32d49
~553 tables. Key tables referenced so far:
- ai_models (model capability flags, rates, secret_key_name)
- agent_telemetry (per-call AI detail, use input_tokens not total_input_tokens)
- agent_messages (conversation messages)
- agentsam_ai (agent definitions, tool_permissions_json, is_active, is_default)
- agentsam_hook / agentsam_hook_execution (deploy/event hooks)
- cicd_pipeline_runs / cicd_run_steps (pipeline tracking)
- deployments (canonical deploy records — cloudflare_deployments no longer exists)
- mcp_registered_tools / mcp_agent_sessions / mcp_audit_log
- system_health_snapshots (integrity snapshots)
- terminal_sessions / terminal_history
- workspace_settings (workspace_root path)
- agent_intent_patterns (LLM routing triggers)

---

## Env vars needed (wrangler.jsonc [vars] section, not secrets)

These were identified as missing/needed during today's session:
- IAM_ORIGIN (e.g. https://inneranimalmedia.com)
- SANDBOX_ORIGIN (e.g. https://inneranimal-dashboard.meauxbility.workers.dev)
- PROJECT_ID (e.g. inneranimalmedia)
- TENANT_ID (e.g. tenant_iam)
- DEPLOY_USER (e.g. sam_primeaux)
- RESEND_TO (notification destination email)
- RESEND_FROM (sending address)
- ENVIRONMENT (sandbox | staging | production — set per GitHub environment)

Integrity threshold tuning vars (optional, have sane defaults):
- INTEGRITY_RD_UNKNOWN_MODEL_MAX (default 5)
- INTEGRITY_RD_UNCLASSIFIED_TASK_MAX (default 10)
- INTEGRITY_RD_PCT_COMPLETE_VALID_MIN (default 95)

---

## What still needs to be placed into the new repo

Still missing from src/api/:
- agent.js (Agent Sam endpoints) — partially done
- agentsam.js — partially done
- auth.js — partially done
- dashboard.js, deployments.js, draw.js, finance.js, health.js, hub.js,
  post-deploy.js, r2-api.js, rag.js, settings.js, telemetry.js, themes.js,
  vault.js, workspace.js, admin.js

Still missing from src/core/:
- router.js, responses.js, session.js, d1.js, r2.js, notifications.js,
  themes.js, durable_objects.js

Still missing from src/tools/builtin/:
- All builtin tool files (see scaffold above)

Still missing from src/integrations/:
- All except anthropic.js

Still missing entirely:
- dashboard/app/ (Vite/React frontend)
- dashboard/pages/ (static HTML shells)
- scripts/benchmark-full.sh
- scripts/promote-to-prod.sh
- .github/workflows/ (3 workflow files)

---

## GitHub repo setup (completed)

Branches: main (protected), staging (protected), dev (open)
Environments: Sandbox (branch: dev), Staging (branch: staging), Production (branch: main)
Each environment has: CLOUDFLARE_API_TOKEN (secret), CLOUDFLARE_ACCOUNT_ID (var),
ENVIRONMENT (var)
Branch rulesets: main protection + staging protection (restrict deletions,
require PR, block force pushes, require linear history)
