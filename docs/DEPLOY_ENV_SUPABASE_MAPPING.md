# Deploy environment variables → databases and tables

This document maps **optional** and **required** deploy-related environment variables to **where each value is persisted**. Use it when wiring Cursor / Agent Sam deploy automation so telemetry lands in the right store.

For shell entrypoints, see `scripts/deploy-full.sh`, `scripts/deploy-frontend.sh`, and the `record-supabase-deploy-*.mjs` scripts.

---

## Database ownership model

| Concern | System | Examples |
|--------|--------|----------|
| Canonical app identity, workspace state, guardrails, R2 operational inventory | **Cloudflare D1** | `auth_users`, tenant/workspace tables, `agentsam_guardrails`, `r2_object_inventory`, `r2_deploy_manifests` |
| Analytics, search index, deploy ledger, eval/tool telemetry | **Supabase (Postgres)** | `build_deploy_events`, `agentsam_*`, `documents`, `semantic_search_log`, `codebase_*` |

Supabase `public.documents` and reingest scripts use **`TENANT_ID`**, **`WORKSPACE_ID`**, and **`DOCUMENTS_PROJECT_ID`** (or **`DEPLOY_PROJECT_ID`**) as explicit columns — **they are not optional** when Supabase deploy recording or `reingest-supabase-documents.mjs --apply` is in play. Do not rely on Supabase column defaults for tenant/workspace (they can point at the wrong workspace).

---

## Required scope when Supabase recording / reingest applies

| Variable | Purpose | Supabase targets |
|----------|---------|-------------------|
| `TENANT_ID` | Tenant scope for all ledger and document rows | `documents.tenant_id`, `build_deploy_events.tenant_id`, `agentsam_* .tenant_id`, etc. |
| `WORKSPACE_ID` | Workspace scope | Same pattern on `.workspace_id` columns |
| `DOCUMENTS_PROJECT_ID` (or `DEPLOY_PROJECT_ID`) | RAG / `documents.project_id` | `public.documents.project_id`; must align with Worker `RAG_DOCUMENTS_PROJECT_ID` when applicable |

Also required for ledger REST writes (same connection as dashboard tooling):

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | PostgREST base URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role for server-side inserts/patches |

Optional for semantic smoke + direct SQL during reingest:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_DB_URL` | Postgres connection for `run-deploy-eval.mjs` RPC (`log_semantic_search`) and `reingest-supabase-documents.mjs` embeddings path |

### Deploy email: audit actor vs notification recipient

These are **different**:

| Variable | Role |
|----------|------|
| `DEPLOY_USER_EMAIL` | **Deploy actor / audit identity** for Supabase ledger rows (`user_email` on eval, tool, error tables). Should align with D1 `auth_users.email` when possible. |
| `DEPLOY_NOTIFY_EMAIL` | **Primary recipient** for the HTML deploy summary email sent by `scripts/deploy-frontend.sh` (`POST /api/email/send` body `to`). |
| `RESEND_NOTIFY_EMAIL` | **Fallback** if `DEPLOY_NOTIFY_EMAIL` is unset (same shell resolution order). |
| `DEPLOY_NOTIFY_EMAILS` | Comma/newline list for Worker `POST /api/notify/deploy-complete` only; otherwise that route uses `DEPLOY_NOTIFY_EMAIL` or `RESEND_NOTIFY_EMAIL` first (`src/api/notify-deploy.js`). |

---

## Optional deploy context variables

### `RUN_GROUP_ID`

- **DB relevance:** Supabase (correlation ID for one full deploy pipeline).
- **Purpose:** Shared correlation ID across one full deploy; prefixes synthetic IDs when unset (`rg_<timestamp>_<short_sha>` in `record-supabase-deploy-start.mjs`).
- **Tables / columns:**
  - `build_deploy_events.id` — derived as `bde_<sanitized_run_group>`; `metadata_jsonb` includes `run_group_id`.
  - `agentsam_workflow_runs.id` — `wf_<sanitized_run_group>`; `d1_run_id` — same string as run group.
  - `agentsam_eval_runs.run_group_id`
  - `agentsam_tool_call_events.run_group_id` (from `.deploy-run-context.json` + JSONL flush)
  - `agentsam_error_events.run_group_id` (failure path)
  - **Future / not wired by deploy scripts today:** `agentsam_prompt_runs.run_group_id`, `agentsam_routing_decisions.run_group_id` if AI deploy steps write those tables.

---

### `TRIGGER_SOURCE`

- **DB relevance:** Supabase.
- **Purpose:** Who or what kicked off the deploy.
- **Expected values (convention):** `manual`, `script`, `github`, `cursor`, `agent`, `cron`, `cloudflare`.
- **Implementation note:** `record-supabase-deploy-start.mjs` uses `TRIGGER_SOURCE` if set; otherwise `CI` → `github`, else `manual`. Workflow `trigger_type` is currently `github` when trigger source is `github`, else `manual` (extend if you need finer granularity).
- **Tables / columns:**
  - `build_deploy_events.trigger_source`
  - `agentsam_workflow_runs.trigger_type` (subset mapping today)
  - `agentsam_eval_runs.run_source` is fixed to **`deploy`** in `record-supabase-deploy-complete.mjs`; put finer trigger detail in **`agentsam_eval_runs.metadata`** if needed.

---

### `DEPLOY_SCRIPT_NAME`

- **DB relevance:** Supabase.
- **Purpose:** Which automation entrypoint ran (string for audit).
- **Default in code:** `deploy:full` if unset (`record-supabase-deploy-start.mjs`).
- **Tables / columns:**
  - `build_deploy_events.script_name`
  - `agentsam_workflow_runs.input_json.script` (nested)
  - `agentsam_tool_call_events.metadata` (via tool logger context)

**Examples:** `deploy:full`, `deploy-frontend.sh`, `deploy-full.sh`.

---

### `DEPLOY_SMOKE_BASE_URL`

- **DB relevance:** Supabase telemetry only (not identity).
- **Purpose:** Base URL for post-deploy health fetch (`run-deploy-eval.mjs`). Default: `https://inneranimalmedia.com`.
- **Where it lands:**
  - **`scripts/run-deploy-eval.mjs`** → `.deploy-eval-results.json` → **`agentsam_eval_runs.artifacts_json.smoke_base_url`**, **`metrics_json.health`**, and semantic RPC **`metadata.base_url`** (semantic path).
  - **`record-supabase-deploy-complete.mjs`** merges eval JSON into **`build_deploy_events.metadata_jsonb`** (under `eval`) and workflow **`output_json`** when finalizing.

---

### `DEPLOY_USER_EMAIL`

- **DB relevance:** Supabase (aligned to **D1 `auth_users.email`** when possible).
- **Resolution:** `DEPLOY_USER_EMAIL` or `USER_EMAIL` (`scripts/lib/supabase-deploy-context.mjs`).
- **Tables / columns:**
  - Stored in **`.deploy-run-context.json`** then:
  - `agentsam_eval_runs.user_email`
  - `agentsam_tool_call_events.user_email`
  - `agentsam_error_events.user_email` (failure recorder)
  - **Not automatically copied to** `build_deploy_events.deployed_by` — that column uses **`DEPLOYED_BY`** / **`DEPLOY_DEPLOYED_BY`** (and defaults to `deploy_script`-style identifiers unless you set them).

**Related:** `DEPLOYED_BY`, `TRIGGERED_BY`, `DEPLOY_TRIGGERED_BY` feed **`build_deploy_events.deployed_by`** and **`triggered_by`** via `resolveDeployScope`.

---

### `D1_AUTH_USER_ID`

- **DB relevance:** **D1** (source of truth) + **Supabase** (analytics foreign context).
- **D1 source:** `auth_users.id` (e.g. `au_…`).
- **Resolution:** `D1_AUTH_USER_ID` or `DEPLOY_D1_AUTH_USER_ID` (`supabase-deploy-context.mjs`).
- **Supabase tables / columns:**
  - `agentsam_eval_runs.d1_auth_user_id`
  - `agentsam_tool_call_events.d1_auth_user_id`
  - `agentsam_error_events.d1_auth_user_id`
  - **Runtime / not populated by deploy scripts by default:** `agentsam_prompt_runs`, `agentsam_routing_decisions`, `agentsam_stream_events` — same column pattern when those writers run.

---

### Identity vars already covered elsewhere

| Variable | Typical use |
|----------|-------------|
| `DEPLOY_ENV` | `build_deploy_events.environment`, workflow `environment` |
| `DEPLOYED_BY` / `DEPLOY_DEPLOYED_BY` | `build_deploy_events.deployed_by` |
| `TRIGGERED_BY` / `DEPLOY_TRIGGERED_BY` | `build_deploy_events.triggered_by` |

---

## Quick reference: optional var → primary Supabase targets

| Variable | Primary columns / JSON blobs |
|----------|------------------------------|
| `RUN_GROUP_ID` | `*_runs.run_group_id`, ledger row IDs derived from run group |
| `TRIGGER_SOURCE` | `build_deploy_events.trigger_source`, workflow `trigger_type` |
| `DEPLOY_SCRIPT_NAME` | `build_deploy_events.script_name`, workflow `input_json` |
| `DEPLOY_SMOKE_BASE_URL` | Eval `artifacts_json` / `metrics_json` → merged into deploy `metadata_jsonb` |
| `DEPLOY_USER_EMAIL` | `agentsam_eval_runs.user_email`, tool/error rows |
| `D1_AUTH_USER_ID` | `agentsam_* .d1_auth_user_id` |

---

## Related files

| File | Role |
|------|------|
| `scripts/lib/supabase-deploy-context.mjs` | Resolves tenant/workspace/project and identity env vars |
| `scripts/record-supabase-deploy-start.mjs` | Creates ledger rows + `.deploy-run-context.json` |
| `scripts/record-supabase-deploy-complete.mjs` | Patches deploy completion, inserts eval + tool events |
| `scripts/record-supabase-deploy-failure.mjs` | Failure rows + error event |
| `scripts/run-deploy-eval.mjs` | Smoke URL + eval JSON consumed by complete script |
| `scripts/log-supabase-deploy-tool.mjs` | Tool JSONL → `agentsam_tool_call_events` on complete |
