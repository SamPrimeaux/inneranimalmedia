# D1 Tables Inspection — Summary and Next Steps

**Database:** inneranimalmedia-business (D1, remote)  
**Inspection date:** 2026-03-02

---

## Where deployments and project/deploy info are recorded

| What | Table / column | Notes |
|------|----------------|--------|
| **Each deploy** | **cloudflare_deployments** | One row per deploy: deployment_id (e.g. wrangler Version ID), worker_name, project_name, deployment_type, status, deployment_url, triggered_by, deployed_at. Query by worker_name = 'inneranimalmedia' for last deploy. |
| **Project linked to worker** | **projects** | id = 'inneranimalmedia', name = 'Inner Animal Media', worker_id = 'inneranimalmedia', domain = 'inneranimalmedia.com'. Use for time tracking (project_time_entries.project_id) and cost attribution. |
| **Last deploy on project** | **projects.metadata_json** | Optional: last_deployment_id, last_deployment_at, last_deployment_note (set by migration 107). Dashboard can read this for “last deployed” without joining. |
| **Per-request usage (tokens, cost)** | **agent_telemetry** | Not for deployment events. Use for token/cost per request; optionally set workspace_id or a project_id (if added) to attribute usage to the inneranimalmedia project. |
| **Time tracking** | **project_time_entries** | project_id = 'inneranimalmedia' (or the project id you use). Start/end sessions for this worker so “time logged” is accurate. |

**First deploy from this repo (2026-03-02)** was recorded in **cloudflare_deployments** (deployment_id `1e4fce97-fe9d-4ee6-a58e-eb12d094d79a`) and in **projects.metadata_json** for id = 'inneranimalmedia' via **migrations/107_inneranimalmedia_deployment_record.sql**.

---

## Key tables and row counts

| Table | Rows | Purpose |
|-------|------|---------|
| **agent_telemetry** | 83 | Fine-grained agent usage: tokens, cost, provider, model, workspace_id, session_id, trace_id |
| **agent_costs** | 0 | Simpler cost log (model_used, tokens_in/out, cost_usd, task_type, user_id) — not yet written to |
| **cloudflare_deployments** | 48 | Deploy history: worker_name, status, build/deploy time, triggered_by, error_message, deployed_at |
| **project_time_entries** | 2 | Time tracking: user_id, project_id, session_id, start_time, end_time, duration_seconds, is_active |
| **r2_bucket_list** | 107 | Buckets we track (bucket_name, account_id, last_synced_at) |
| **r2_objects** | 63 | Object inventory (bucket_id, object_key, content_type, file_size, etag, public_url, tags, uploaded_by) |

---

## Schema highlights

### agent_telemetry (use this for token + time insight)
- **Scoping:** tenant_id, session_id, workspace_id, agent_id, agent_email
- **Tokens/cost:** input_tokens, output_tokens, total_input_tokens, cost_estimate, computed_cost_usd, cost_breakdown_json, provider, model_used
- **Cache:** cache_creation_input_tokens, cache_read_input_tokens, cache_hit_rate, cache_cost_savings_usd
- **Audit:** command_id, metric_type, metric_name, event_type, trace_id, span_id, created_at
- **Optional:** Add `command_key` (TEXT) to join to agent_command_audit_log if you want “which command caused this call”

### agent_costs (currently empty)
- id, model_used, tokens_in, tokens_out, cost_usd, task_type, user_id, created_at
- **Suggestion:** Add `project_id` (TEXT) so usage can be attributed to “inneranimalmedia worker” or other projects. Then have the worker write here from /api/agent/usage-log or aggregate from agent_telemetry.

### cloudflare_deployments (good for avoiding stale deploys)
- id, worker_name, status, preview_url, build_time_seconds, deploy_time_seconds, triggered_by, error_message, rollback_from_deployment_id, deployed_at, created_at
- **Use:** Before deploying, show “last deployment” and “last successful” in dashboard/context so you don’t re-deploy wrong or stale builds.

### project_time_entries (time tracking)
- id, user_id, project_id, session_id, start_time, end_time, duration_seconds, is_active, description, created_at
- **Use:** Create a fixed project (e.g. “inneranimalmedia-dashboard”) and have the dashboard or agent start/stop entries, or derive “session duration” from agent_telemetry (first → last event per session_id).

### r2_bucket_list / r2_objects
- **r2_bucket_list:** Which buckets exist and when they were last synced.
- **r2_objects:** What’s in R2 (key, size, etag, public_url). Use to compare “what we think we deployed” vs “what’s actually in R2” and avoid relapsing to old assets.

---

## Recommended next steps (in order)

1. **Wire agent_costs or agent_telemetry to the worker**  
   Ensure every agent call (chat, run-sql, generate-image, etc.) writes at least one row to **agent_telemetry** (you already have 83 rows). Optionally also write a summary row to **agent_costs** so you have a simple table for “cost per user/task.” If you add project_id to agent_costs, set it from session or a default “inneranimalmedia” project.

2. **Use cloudflare_deployments in the worker**  
   On every deploy (or in a post-deploy hook), insert a row into **cloudflare_deployments** with worker_name = `inneranimalmedia`, status, build/deploy time, and triggered_by. Then:
   - In /api/agent/context or dashboard overview, return “last_deployment” and “last_successful_deployment” so the UI can show “Last deployed: …” and warn if about to deploy from a different build.

3. **Drive dashboard overview from real data**  
   For `/dashboard/overview`:
   - **Time:** Use project_time_entries (start/end, duration) and/or derive from agent_telemetry (min/max timestamp per session_id or workspace_id).
   - **Tokens/cost:** Sum from agent_telemetry (computed_cost_usd, input_tokens, output_tokens) or from agent_costs once you write to it. Filter by user_id and optionally project_id.
   - **Deployments:** Last N rows from cloudflare_deployments for worker_name = 'inneranimalmedia'.
   - **R2:** Last sync from r2_bucket_list; optionally count r2_objects per bucket.

4. **Project for “inneranimalmedia worker”**  
   In **projects** (or wherever project_id in project_time_entries points), ensure there is a project like “inneranimalmedia-dashboard” or “inneranimalmedia-worker.” Use it for project_time_entries and, if you add project_id to agent_costs, for token/cost attribution.

5. **Keep R2 inventory updated**  
   Use a cron (you have several) or a post-upload path to update **r2_bucket_list** and **r2_objects** for buckets: inneranimalmedia-assets, agent-sam, iam-platform, splineicons. Then you can show “what’s in R2” in the dashboard and avoid “deployed but file missing” or “stale build.”

6. **Optional: command_key on agent_telemetry**  
   If you want to join agent usage to agent_command_audit_log, add column `command_key` (TEXT) to agent_telemetry and set it when writing telemetry for a command/tool run.

7. **Document “single source of truth”**  
   In this repo, keep **docs/R2_KEY_LAYOUT.md** (or similar) with URL → R2 key mapping, and reference **cloudflare_deployments** + **r2_objects** as the way to avoid token waste, destroyed builds, and stale deployments.

---

## Worker config (for reference)

Your Cloudflare Worker **inneranimalmedia** already has:
- **Vars/secrets:** CLOUDFLARE_ACCOUNT_ID, API keys (Anthropic, Cursor, OpenAI, Workers AI, Meshy, etc.), OAuth, Stripe, Resend, etc.
- **Triggers:** 6 crons, queue consumer.
- **Observability:** Workers Logs, Workers Traces, optional Logpush/Tail.

All of the above should stay **--remote** and **version-tracked**; the worker should read/write D1 only via the DB binding, and R2 via the ASSETS/DASHBOARD/R2 bindings.
