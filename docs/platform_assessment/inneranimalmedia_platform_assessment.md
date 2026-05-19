# Inner Animal Media Platform Assessment

Generated/started: 2026-05-18

Purpose:
Create a single platform inventory file for Agent Sam / Inner Animal Media so future audits, Cursor/Claude prompts, Worker reviews, wrangler config checks, and architecture gap analysis can reference real bindings/secrets/frontend names without guessing.

Important:
- Secret values are not included.
- This file records names, binding types, frontend/runtime labels, scheduled triggers, and deployment/runtime configuration.
- Use this to compare Cloudflare dashboard state against wrangler.production.toml, Worker env access, D1 schema, MCP/tool registry, and dashboard UI expectations.

---

## 1. Worker Bindings

| Type | Name | Value / Resource |
|---|---|---|
| Durable Object | AGENT_SESSION | inneranimalmedia_AgentChatSqlV1 |
| Workers AI | AI | Workers AI Catalog |
| R2 bucket | ASSETS | inneranimalmedia |
| R2 bucket | AUTORAG_BUCKET | inneranimalmedia-autorag |
| Durable Object | CHESS_SESSION | inneranimalmedia_ChessRoom |
| R2 bucket | DASHBOARD | inneranimalmedia |
| D1 database | DB | inneranimalmedia-business |
| R2 bucket | DOCS_BUCKET | iam-docs |
| R2 bucket | EMAIL | inneranimalmedia-email-archive |
| Hyperdrive | HYPERDRIVE | inneranimalmedia-supabase-hyperdrive |
| Durable Object | IAM_COLLAB | inneranimalmedia_IAMCollaborationSession |
| KV namespace | KV | MCP_TOKENS |
| Browser Run | MYBROWSER | — |
| Queue | MY_QUEUE | 74b3155b36334b69852411c083d50322 |
| R2 bucket | R2 | iam-platform |
| KV namespace | SESSION_CACHE | production-KV_SESSIONS |
| R2 bucket | TOOLS | tools |
| Vectorize index | VECTORIZE | ai-search-inneranimalmedia-autorag |
| Analytics Engine | WAE | inneranimalmedia |

---

## 2. Variables and Secrets

### Plaintext Variables

| Name | Value |
|---|---|
| AI_SEARCH_ENDPOINT | https://2da31515-2005-42e4-9efe-a4e6a425a627.search.ai.cloudflare.com |
| CLOUDFLARE_ACCOUNT_ID | ede6590ac0d2fb7daf155b35653457b2 |
| CLOUDFLARE_IMAGES_ACCOUNT_HASH | g7wf09fCONpnidkRnR_5vw |
| DEPLOY_ENV | production |
| ENVIRONMENT | production |
| GITHUB_CLIENT_ID | Ov23li6BZYxjVtGUWibX |
| GOOGLE_CLIENT_ID | 427617292678-gf3u47lpf876q7miq31hel2ms6tcr2f8.apps.googleusercontent.com |
| OPENAI_API_BASE_URL | https://api.openai.com/v1 |
| R2_AUTORAG_BUCKET_NAME | inneranimalmedia-autorag |
| RAG_AGENT_ID | inneranimalmedia |
| RAG_AUTORAG_FOLDER_PREFIXES | knowledge/,memory/,context/,docs/,plans/,recipes/,roadmap/,workflows/ |
| RAG_DOCUMENTS_PROJECT_ID | inneranimalmedia |
| RAG_EMBEDDING_DIMENSIONS | 1024 |
| RAG_OPENAI_EMBEDDING_MODEL | text-embedding-3-large |
| SUPABASE_S3_ENDPOINT | https://dpmuvynqixblxsilnlut.storage.supabase.co/storage/v1/s3 |
| SUPABASE_S3_REGION | us-east-2 |
| TENANT_ID | tenant_inneranimalmedia |
| WORKSPACE_ID | ws_inneranimalmedia |

### Secret Names

| Name | Value State |
|---|---|
| AGENTSAM_BRIDGE_KEY | encrypted |
| AGENT_SAM_DEPLOY_HOOK_URL | encrypted |
| AI_SEARCH_TOKEN | encrypted |
| ANTHROPIC_ADMIN_KEY | encrypted |
| ANTHROPIC_API_KEY | encrypted |
| ANTHROPIC_WEBHOOK_SIGNING_KEY | encrypted |
| AUTH_HOOK_SECRET | encrypted |
| AUTH_HOOK_SECRET_BUC | encrypted |
| AUTH_HOOK_SECRET_CAT | encrypted |
| BLUEBUBBLES_PASSWORD | encrypted |
| BLUEBUBBLES_URL | encrypted |
| BLUEBUBBLES_WEBHOOK_SECRET | encrypted |
| CF_ACCESS_AUD | encrypted |
| CF_ACCESS_CLIENT_ID | encrypted |
| CF_ACCESS_CLIENT_SECRET | encrypted |
| CF_ACCESS_TEAM_DOMAIN | encrypted |
| CLOUDCONVERT_API_KEY | encrypted |
| CLOUDFLARE_API_TOKEN | encrypted |
| CLOUDFLARE_CALLS_APP_ID | encrypted |
| CLOUDFLARE_CALLS_APP_SECRET | encrypted |
| CLOUDFLARE_IMAGES_TOKEN | encrypted |
| CLOUDFLARE_STREAM_TOKEN | encrypted |
| CURSOR_API_KEY | encrypted |
| CURSOR_API_TOKEN | encrypted |
| CURSOR_WEBHOOK_SECRET | encrypted |
| DEPLOY_TRACKING_TOKEN | encrypted |
| GEMINI_API_KEY | encrypted |
| GITHUB_APP_CLIENT_ID | encrypted |
| GITHUB_APP_CLIENT_SECRET | encrypted |
| GITHUB_APP_ID | encrypted |
| GITHUB_APP_PRIVATE_KEY | encrypted |
| GITHUB_CLIENT_SECRET | encrypted |
| GITHUB_TOKEN | encrypted |
| GITHUB_WEBHOOK_SECRET | encrypted |
| GMAIL_DELEGATED_USER | encrypted |
| GOOGLE_AI_API_KEY | encrypted |
| GOOGLE_API_KEY | encrypted |
| GOOGLE_CLIENT_SECRET | encrypted |
| GOOGLE_OAUTH_CLIENT_SECRET | encrypted |
| GOOGLE_PROJECT_ID | encrypted |
| GOOGLE_SERVICE_ACCOUNT_JSON | encrypted |
| IAM_ENABLE_E2E_TEST_ROUTES | encrypted |
| IAM_TEST_SECRET | encrypted |
| INGEST_SECRET | encrypted |
| INTERNAL_API_SECRET | encrypted |
| INTERNAL_WEBHOOK_SECRET | encrypted |
| MCP_AUTH_TOKEN | encrypted |
| MESHYAI_API_KEY | encrypted |
| OLLAMA_BASE_URL | encrypted |
| OLLAMA_CF_CLIENT_ID | encrypted |
| OLLAMA_CF_CLIENT_SECRET | encrypted |
| OLLAMA_TUNNEL_URL | encrypted |
| OPENAI_API_KEY | encrypted |
| OPENAI_WEBHOOK_SECRET | encrypted |
| OPENSCAD_ENABLED | encrypted |
| POLICY_AUD | encrypted |
| PTY_AUTH_TOKEN | encrypted |
| R2_ACCESS_KEY_ID | encrypted |
| R2_SECRET_ACCESS_KEY | encrypted |
| REALTIME_TURN_API_TOKEN | encrypted |
| RESEND_API_KEY | encrypted |
| RESEND_FROM | encrypted |
| RESEND_INBOUND_WEBHOOK_SECRET | encrypted |
| RESEND_WEBHOOK_SECRET | encrypted |
| SHINSHU_MCP_SECRET | encrypted |
| SPLINE_API_KEY | encrypted |
| SSH_TARGETS_JSON | encrypted |
| STRIPE_SECRET_KEY | encrypted |
| STRIPE_WEBHOOK_SECRET | encrypted |
| SUPABASE_ANON_KEY | encrypted |
| SUPABASE_DB_PASSWORD | encrypted |
| SUPABASE_DB_URL | encrypted |
| SUPABASE_DB_WEBHOOK_SECRET | encrypted |
| SUPABASE_JWT_SECRET | encrypted |
| SUPABASE_MANAGEMENT_OAUTH_CLIENT_ID | encrypted |
| SUPABASE_MANAGEMENT_OAUTH_CLIENT_SECRET | encrypted |
| SUPABASE_OAUTH_CLIENT_ID | encrypted |
| SUPABASE_OAUTH_CLIENT_SECRET | encrypted |
| SUPABASE_S3_KEY_ID | encrypted |
| SUPABASE_S3_SECRET | encrypted |
| SUPABASE_SERVICE_KEY | encrypted |
| SUPABASE_SERVICE_ROLE_KEY | encrypted |
| SUPABASE_URL | encrypted |
| SUPABASE_WEBHOOK_SECRET | encrypted |
| TEAM_DOMAIN | encrypted |
| TERMINAL_SECRET | encrypted |
| TERMINAL_WS_URL | encrypted |
| VAULT_KEY | encrypted |
| VAULT_MASTER_KEY | encrypted |

---

## 3. Trigger Events

| Type | Handler | Schedule / Details | Next From Dashboard |
|---|---|---|---|
| Cron | scheduled() | 30 13 * * * | Tue, 19 May 2026 13:30:00 |
| Cron | scheduled() | */30 * * * * | Tue, 19 May 2026 03:30:00 |
| Cron | scheduled() | 10 0 * * * | Wed, 20 May 2026 00:10:00 |
| Cron | scheduled() | 0 9 * * 1 | Sun, 24 May 2026 09:00:00 |
| Cron | scheduled() | 0 9 * * * | Tue, 19 May 2026 09:00:00 |
| Cron | scheduled() | 0 6 * * * | Tue, 19 May 2026 06:00:00 |
| Cron | scheduled() | 0 3 * * * | Wed, 20 May 2026 03:00:00 |
| Cron | scheduled() | 0 1 * * sun | Sun, 24 May 2026 01:00:00 |
| Cron | scheduled() | 0 1 * * * | Wed, 20 May 2026 01:00:00 |
| Cron | scheduled() | 0 0 1 * * | Mon, 01 Jun 2026 00:00:00 |
| Cron | scheduled() | 0 0 * * * | Wed, 20 May 2026 00:00:00 |
| Cron | scheduled() | 0 * * * * | Tue, 19 May 2026 04:00:00 |
| Queue | queue() | 74b3155b36334b69852411c083d50322 | — |

---

## 4. Observability

| Setting | Value |
|---|---|
| Logs | Enabled |
| Traces | Disabled |
| Exports | No destinations configured |
| Sampling | Logs: 100% |
| Tail Worker | inneranimalmedia-tail |

Assessment Notes:
- Logs are enabled at 100%, which is good for immediate debugging.
- Traces are disabled. For Agent Sam IDE-quality debugging, trace coverage should eventually include agent runs, tool calls, model routing, D1 writes, terminal actions, browser actions, and deploy hooks.
- No external export destination is configured. Consider whether D1/Supabase/Analytics Engine should receive summarized operational telemetry.

---

## 5. Runtime

| Setting | Value |
|---|---|
| Placement | Default |
| Compatibility Date | Jan 20, 2026 |
| Compatibility Flags | nodejs_compat |

Assessment Notes:
- nodejs_compat is enabled, which matters for SDKs and compatibility.
- Confirm wrangler.production.toml exactly matches dashboard runtime config.
- Confirm Worker code does not rely on local-only Node APIs unavailable in Workers runtime.

---

## 6. Build / Deploy

| Setting | Value |
|---|---|
| Git repository | SamPrimeaux/inneranimalmedia |
| Build command | None |
| Deploy command | npx wrangler deploy -c wrangler.production.toml |
| Version command | npx wrangler versions upload |
| Root directory | / |
| Production branch | main |
| Builds for non-production branches | Enabled |
| Include watch paths | * |
| Exclude watch paths | snapshot-*.json, docs/**, *.md, dashboard/** |
| API token name | Workers Builds - 2026-05-02 22:51 |

Assessment Notes:
- Dashboard files are excluded from build watch paths. Confirm whether this is intentional.
- If dashboard deploys are expected from dashboard/** changes, this exclusion may explain missing or stale frontend updates.
- Deploy command points at wrangler.production.toml. This file should be treated as the canonical Worker binding/config source.
- Version upload exists separately from deploy. Confirm current release flow:
  1. version upload
  2. deploy
  3. D1 migration
  4. asset upload
  5. dashboard cache bump

---

## 7. Immediate Audit Questions

Use this section while comparing Cloudflare dashboard state, wrangler.production.toml, Worker code, and D1 tables.

### Binding Consistency

- [ ] Does wrangler.production.toml define every binding listed above?
- [ ] Are any dashboard bindings missing from wrangler.production.toml?
- [ ] Are any wrangler.production.toml bindings missing from the dashboard?
- [ ] Are binding names consistent with Worker code access patterns, for example `env.DB`, `env.AI`, `env.VECTORIZE`, `env.HYPERDRIVE`?
- [ ] Are legacy aliases still used in code, for example both `R2` and `ASSETS` for similar storage?

### Secret Usage

- [ ] Which secrets are read by production Worker code?
- [ ] Which secrets exist but are unused?
- [ ] Which secrets are required by dashboard UI features?
- [ ] Which secrets are required by scheduled jobs?
- [ ] Which secrets are required by MCP/auth/OAuth flows?
- [ ] Which secrets are duplicated or overlapping?
- [ ] Are any plaintext values accidentally better stored as secrets?

### Agent Sam IDE-Quality Wiring

- [ ] Which binding powers Agent Sam chat?
- [ ] Which binding powers terminal sessions?
- [ ] Which binding powers browser control?
- [ ] Which binding powers model routing?
- [ ] Which binding powers tool execution?
- [ ] Which binding powers artifacts?
- [ ] Which binding powers RAG/search?
- [ ] Which binding powers screenshots/browser evidence?
- [ ] Which binding powers workflow runs?
- [ ] Which binding powers approval gates?

### Cron / Queue

- [ ] What does each scheduled cron job actually do in code?
- [ ] Which crons write to agentsam_* tables?
- [ ] Which crons are duplicate or overlapping?
- [ ] Which crons are legacy?
- [ ] Which crons require specific secrets/bindings?
- [ ] Does queue() write durable status/logs into D1?
- [ ] Does queue() have retry/dead-letter handling?

### Observability

- [ ] Are Worker logs connected to `agentsam_error_log` or related D1 tables?
- [ ] Is Analytics Engine WAE actually written to?
- [ ] Are traces disabled intentionally?
- [ ] Does Tail Worker persist useful debug information?
- [ ] Are failed tool/model/terminal/browser actions captured with run IDs?

### Build Watch Risk

- [ ] Why is `dashboard/**` excluded from Worker Builds watch paths?
- [ ] Does dashboard deploy through a separate build/upload process?
- [ ] Could this cause dashboard changes to not appear after Git pushes?
- [ ] Should dashboard dist assets be uploaded to R2 separately?
- [ ] Should production deploy require explicit owner approval?

---

## 8. Suggested Next Scripts

Create or run these audits against this file:

1. Compare Cloudflare dashboard inventory to wrangler.production.toml
2. Search codebase for every `env.<NAME>` usage
3. Search codebase for every secret name usage
4. Map each binding to routes/handlers that consume it
5. Map each cron expression to scheduled() handler branch
6. Map each queue consumer to D1/observability writes
7. Detect unused or duplicate secrets
8. Detect frontend features whose required binding/route is missing
9. Detect Agent Sam IDE gaps caused by missing env/binding access
10. Produce platform readiness score

---

## 9. Manual Notes / Follow-Up Paste Area

Paste additional dashboard screenshots, wrangler snippets, binding details, or command outputs below this line.

---

## 12. Agent Run Spine Doctrine

### Canonical Rule

`agentsam_agent_run` is the canonical D1 table for one Agent Sam chat/agent run.

The runtime value named `agent_run_id` should be treated as:

```text
agent_run_id = agentsam_agent_run.id
```

This means `agent_run_id` is **not** a separate table. It is the foreign-key-style runtime label used by SSE, frontend state, tool calls, terminal commands, browser evidence, patches, and workflow bridges to refer back to `agentsam_agent_run.id`.

### Current Naming Map

| Layer | Name | Meaning |
|-------|------|---------|
| D1 table | `agentsam_agent_run` | Canonical store for agent/chat run lifecycle |
| Primary key column | `id` | Actual run identifier |
| Runtime/SSE field | `agent_run_id` | Same value as `agentsam_agent_run.id` |
| In-memory variable | `chatAgentRunId` | Generated at start of `POST /api/agent/chat` |
| ID format | `arun_<uuid-slice>` | Generated by `newChatAgentRunId()` |

### Current Understanding

The chat layer generates `chatAgentRunId`, inserts a row into `agentsam_agent_run`, and exposes the same value to the client as `agent_run_id`.

The architectural gap is **not** naming. The gap is **propagation**.

Several downstream side effects do not consistently link back to the same run spine:

- tool executions
- MCP tool calls
- terminal commands
- browser screenshots / Playwright jobs
- patches / diffs / change sets
- validation results
- workflow bridges
- final summaries / artifacts

### Implementation Rule

Every Agent Sam side effect should be traceable back to the canonical run.

**Preferred direct shape:**

```text
child_table.agent_run_id → agentsam_agent_run.id
```

**Acceptable indirect shape:**

```text
child_table.workflow_run_id → agentsam_workflow_runs.id
agentsam_workflow_runs.agent_run_id or parent metadata → agentsam_agent_run.id
```

or:

```text
child_table.execution_id / chain_root_id → table with agent_run_id → agentsam_agent_run.id
```

### Do Not Do Blindly

Do not blindly add `agent_run_id` columns everywhere without checking existing schema.

First audit:

1. Does the table already have `agent_run_id`?
2. Does it have `run_id`, `workflow_run_id`, `execution_id`, `session_id`, `chain_root_id`, or `metadata_json` that already carries the run?
3. Does application code actually populate that field?
4. Is the link queryable from D1 without parsing logs?
5. Is the field indexed?

### Tables That Should Be Checked First

| Area | Candidate tables |
|------|------------------|
| canonical run | `agentsam_agent_run` |
| overlapping run/execution | `agentsam_executions`, `agentsam_execution_steps` |
| workflow bridge | `agentsam_workflow_runs`, `agentsam_workflow_nodes`, `agentsam_workflow_edges` |
| tools | `agentsam_tool_chain`, `agentsam_tool_call_log`, `agentsam_mcp_tool_execution`, `agentsam_skill_invocation` |
| terminal | `agentsam_command_run`, terminal history/session tables if outside `agentsam_` prefix |
| browser | `playwright_jobs`, `agentsam_browser_trusted_origin` |
| patches/diffs | `change_sets`, `change_set_items`, `agentsam_patch_sessions` |
| artifacts | `agentsam_artifacts` |
| approvals | `agentsam_approval_queue` |
| telemetry | `agentsam_usage_events`, `agentsam_error_log`, `agentsam_execution_performance_metrics` |

### Cursor-Quality Meaning

A Cursor-quality Agent Sam run should be reconstructable from D1:

```text
agentsam_agent_run.id
  → messages / SSE context
  → model route decision
  → context gathered
  → tools invoked
  → terminal commands proposed/executed
  → patches/diffs generated
  → accept/reject decision
  → files written
  → browser evidence/screenshots
  → validation result
  → final summary/artifact
  → cost/tokens/latency/errors
```

### Next Required Audit

Create a focused run-spine audit that checks every relevant table for:

- `agent_run_id`
- `run_id`
- `workflow_run_id`
- `execution_id`
- `session_id`
- `chain_root_id`
- `metadata_json`
- indexes involving those fields
- whether source code writes those fields

Output should classify each table as:

| Classification | Meaning |
|----------------|---------|
| `DIRECT_LINKED` | Has `agent_run_id` column |
| `DIRECT_ID_OVERLAP` | Table `id` likely reuses `agentsam_agent_run.id` (e.g. chat-path `agentsam_executions`) |
| `INDIRECT_LINKED` | Has `workflow_run_id`, `execution_id`, `chain_root_id`, `session_id`, `command_run_id`, etc. |
| `HAS_COLUMN_NOT_POPULATED` | Has link column but sampled rows are empty |
| `METADATA_ONLY` | Has `metadata_json` but no direct run column |
| `MISSING_LINK` | Runtime side-effect table with no traceable run column |
| `NOT_RELEVANT` | Catalog/config/reference table |

Run: `python3 scripts/audit_run_spine_linkage.py` (see `artifacts/agentsam_run_spine_audit/`).

