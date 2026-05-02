INSERT OR REPLACE INTO ai_knowledge_base (id, tenant_id, title, content, content_type, category, source_url, author, metadata_json, chunk_count, token_count, is_indexed, is_active, created_at, updated_at) VALUES (
'kb-iam-d1-canonical-keys-20260322',
'tenant_sam_primeaux',
'D1 canonical agent_memory_index keys, dashboard_versions, roadmap sync (IAM)',
'# D1 canonical keys — agent_memory_index + related

## Production tenant

For **active_priorities**, **build_progress**, **today_todo**, and **dashboard_version**, the canonical rows in remote D1 use:

`tenant_id = ''system''`

Session-start queries must filter on this tenant (see `.cursor/rules/session-start-d1-context.mdc`).

## dashboard_versions table

Structured history of shipped agent bundles lives in **`dashboard_versions`** (`page_name` agent / agent-css / agent-html, `version` like v120, `r2_path`, `created_at`).

The **`agent_memory_index` key `dashboard_version`** holds a short narrative linking that table to **`dashboard/agent.html`** `?v=` (they can diverge until the next `deploy-with-record` / R2 sync).

## Re-sync script

After large platform sessions, you can re-run:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=scripts/d1-sync-session-2026-03-22.sql
```

Copy the SQL file to a new dated name when contents change materially. **`memory_type`** for `agent_memory_index` must be one of: `learned_pattern`, `user_context`, `execution_outcome`, `error_recovery`, `decision_log`.

## roadmap_steps

Cross-cutting sprints (e.g. **Mar 23 UI**) may be tracked as extra rows on **`plan_iam_dashboard_v1`** (example id: `step_mar23_ui_sprint`, `order_index` 22).


--- SQL sync reference (scripts/d1-sync-session-2026-03-22.sql) ---

-- Session sync 2026-03-22 — agent_memory_index + roadmap_steps
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-sync-session-2026-03-22.sql

UPDATE agent_memory_index
SET value = ''LAST SYNC: 2026-03-22. Worker inneranimalmedia: webhooks 8 endpoints + 15 hook_subscriptions live; GitHub webhook_events + hook_executions verified (hks_gh_event, status success). Cron 6am UTC: RAG chain + webhook_events cleanup + webhook_event_stats rollup. Builtins: CloudConvert + Meshy; d1_write agent_memory_index INSERT guard. Secrets: INTERNAL_API_SECRET vs INTERNAL_WEBHOOK_SECRET split for internal routes vs webhooks. Infra: cicd_runs, deployment_tracking, webhook_event_stats; Solarized Dark theme D1; TURN; Chrome DevTools MCP tools; PTY ecosystem repaired. Morning brief: scripts/send-morning-brief-email.mjs (Resend default schedule today 8:30am America/Chicago). Plan doc: docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md. TOP 3 NEXT: (1) Terminal sessionId / FloatingPreviewPanel WS vs worker. (2) SettingsPanel.jsx Cursor-parity (env, agents, tools, webhooks, deploy, Cursor tab). (3) Agent Sam polish: dock bar CSS vars, icons, multi-panel, welcome cards; bump v after R2.'',
    updated_at = unixepoch()
WHERE tenant_id = ''system'' AND key = ''active_priorities'';

UPDATE agent_memory_index
SET value = ''Roughly 12+ roadmap steps completed under plan_iam_dashboard_v1 (auth through daily digest, MCP, Playwright, etc.). New infra not all as roadmap rows: full webhook platform (8 sources), hook pipeline, D1 analytics tables, 37+ secrets + vault alignment, hook_executions success semantics. IN PROGRESS: terminal session persistence, SettingsPanel overhaul, R2 UI panel, memory retrieval, cost tracking, progress UI, Monaco. NOT STARTED: exit codes, CI/CD completion UI, Vertex, client dashboard, billing, SaaS. Production bundle: dashboard_versions table latest agent v120 (js/css/html rows); dashboard/agent.html may use ?v=122 until next deploy-with-record R2 sync.'',
    updated_at = unixepoch()
WHERE tenant_id = ''system'' AND key = ''build_progress'';

INSERT OR REPLACE INTO agent_memory_index (id, tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at)
VALUES (
  ''ami_dashboard_version_note'',
  ''system'',
  ''agent-sam-primary'',
  ''user_context'',
  ''dashboard_version'',
  ''dashboard_versions D1: latest production agent bundle v120 (agent + agent-css + agent-html rows). HTML cache-bust query param on dashboard/agent.html may read v122 in repo until next R2 upload + deploy-with-record. See scripts/deploy-with-record.sh for logging.'',
  7,
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO agent_memory_index (id, tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at)
VALUES (
  ''ami_today_todo_20260322'',
  ''system'',
  ''agent-sam-primary'',
  ''user_context'',
  ''today_todo'',
  ''1) Sprint1: Fix terminal sessionId (grep FloatingPreviewPanel + worker runTerminalCommand; align WS registration key). 2) Sprint2: SettingsPanel two-column nav + live saves + tabs Environment/Agents/Providers/Webhooks/Deploy/Cursor. 3) Sprint3: Agent dock CSS vars, icon states, multi-panel tabs, welcome cards; v123 after R2. Reference: docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md'',
  9,
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO roadmap_steps (id, plan_id, tenant_id, title, description, status, order_index, created_at, updated_at)
VALUES (
  ''step_mar23_ui_sprint'',
  ''plan_iam_dashboard_v1'',
  ''tenant_sam_primeaux'',
  ''Mar 23 sprint — terminal, Settings control plane, Agent polish'',
  ''docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md. Blocks: terminal session before relying on shell state. SettingsPanel.jsx is primary file. agent.html v bump after R2 only.'',
  ''in_progress'',
  22,
  datetime(''now''),
  datetime(''now'')
);
',
'document',
'operations',
'repo:docs/memory/D1_CANONICAL_AGENT_KEYS.md',
'cursor-agent',
'{"client_id":"client_sam_primeaux","client_name":"Inner Animal Media","tenant_id":"tenant_sam_primeaux","doc_kind":"d1_ops_canonical"}',
1,
1351,
0,
1,
unixepoch(),
unixepoch()
);

INSERT OR REPLACE INTO ai_knowledge_chunks (id, knowledge_id, tenant_id, chunk_index, content, content_preview, token_count, metadata_json, is_indexed, created_at) VALUES (
'kb-iam-d1-canonical-keys-20260322-c0',
'kb-iam-d1-canonical-keys-20260322',
'tenant_sam_primeaux',
0,
'# D1 canonical keys — agent_memory_index + related

## Production tenant

For **active_priorities**, **build_progress**, **today_todo**, and **dashboard_version**, the canonical rows in remote D1 use:

`tenant_id = ''system''`

Session-start queries must filter on this tenant (see `.cursor/rules/session-start-d1-context.mdc`).

## dashboard_versions table

Structured history of shipped agent bundles lives in **`dashboard_versions`** (`page_name` agent / agent-css / agent-html, `version` like v120, `r2_path`, `created_at`).

The **`agent_memory_index` key `dashboard_version`** holds a short narrative linking that table to **`dashboard/agent.html`** `?v=` (they can diverge until the next `deploy-with-record` / R2 sync).

## Re-sync script

After large platform sessions, you can re-run:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=scripts/d1-sync-session-2026-03-22.sql
```

Copy the SQL file to a new dated name when contents change materially. **`memory_type`** for `agent_memory_index` must be one of: `learned_pattern`, `user_context`, `execution_outcome`, `error_recovery`, `decision_log`.

## roadmap_steps

Cross-cutting sprints (e.g. **Mar 23 UI**) may be tracked as extra rows on **`plan_iam_dashboard_v1`** (example id: `step_mar23_ui_sprint`, `order_index` 22).


--- SQL sync reference (scripts/d1-sync-session-2026-03-22.sql) ---

-- Session sync 2026-03-22 — agent_memory_index + roadmap_steps
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-sync-session-2026-03-22.sql

UPDATE agent_memory_index
SET value = ''LAST SYNC: 2026-03-22. Worker inneranimalmedia: webhooks 8 endpoints + 15 hook_subscriptions live; GitHub webhook_events + hook_executions verified (hks_gh_event, status success). Cron 6am UTC: RAG chain + webhook_events cleanup + webhook_event_stats rollup. Builtins: CloudConvert + Meshy; d1_write agent_memory_index INSERT guard. Secrets: INTERNAL_API_SECRET vs INTERNAL_WEBHOOK_SECRET split for internal routes vs webhooks. Infra: cicd_runs, deployment_tracking, webhook_event_stats; Solarized Dark theme D1; TURN; Chrome DevTools MCP tools; PTY ecosystem repaired. Morning brief: scripts/send-morning-brief-email.mjs (Resend default schedule today 8:30am America/Chicago). Plan doc: docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md. TOP 3 NEXT: (1) Terminal sessionId / FloatingPreviewPanel WS vs worker. (2) SettingsPanel.jsx Cursor-parity (env, agents, tools, webhooks, deploy, Cursor tab). (3) Agent Sam polish: dock bar CSS vars, icons, multi-panel, welcome cards; bump v after R2.'',
    updated_at = unixepoch()
WHERE tenant_id = ''system'' AND key = ''active_priorities'';

UPDATE agent_memory_index
SET value = ''Roughly 12+ roadmap steps completed under plan_iam_dashboard_v1 (auth through daily digest, MCP, Playwright, etc.). New infra not all as roadmap rows: full webhook platform (8 sources), hook pipeline, D1 analytics tables, 37+ secrets + vault alignment, hook_executions success semantics. IN PROGRESS: terminal session persistence, SettingsPanel overhaul, R2 UI panel, memory retrieval, cost tracking, progress UI, Monaco. NOT STARTED: exit codes, CI/CD completion UI, Vertex, client dashboard, billing, SaaS. Production bundle: dashboard_versions table latest agent v120 (js/css/html rows); dashboard/agent.html may use ?v=122 until next deploy-with-record R2 sync.'',
    updated_at = unixepoch()
WHERE tenant_id = ''system'' AND key = ''build_progress'';

INSERT OR REPLACE INTO agent_memory_index (id, tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at)
VALUES (
  ''ami_dashboard_version_note'',
  ''system'',
  ''agent-sam-primary'',
  ''user_context'',
  ''dashboard_version'',
  ''dashboard_versions D1: latest production agent bundle v120 (agent + agent-css + agent-html rows). HTML cache-bust query param on dashboard/agent.html may read v122 in repo until next R2 upload + deploy-with-record. See scripts/deploy-with-record.sh for logging.'',
  7,
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO agent_memory_index (id, tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at)
VALUES (
  ''ami_today_todo_20260322'',
  ''system'',
  ''agent-sam-primary'',
  ''user_context'',
  ''today_todo'',
  ''1) Sprint1: Fix terminal sessionId (grep FloatingPreviewPanel + worker runTerminalCommand; align WS registration key). 2) Sprint2: SettingsPanel two-column nav + live saves + tabs Environment/Agents/Providers/Webhooks/Deploy/Cursor. 3) Sprint3: Agent dock CSS vars, icon states, multi-panel tabs, welcome cards; v123 after R2. Reference: docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md'',
  9,
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO roadmap_steps (id, plan_id, tenant_id, title, description, status, order_index, created_at, updated_at)
VALUES (
  ''step_mar23_ui_sprint'',
  ''plan_iam_dashboard_v1'',
  ''tenant_sam_primeaux'',
  ''Mar 23 sprint — terminal, Settings control plane, Agent polish'',
  ''docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md. Blocks: terminal session before relying on shell state. SettingsPanel.jsx is primary file. agent.html v bump after R2 only.'',
  ''in_progress'',
  22,
  datetime(''now''),
  datetime(''now'')
);
',
'# D1 canonical keys — agent_memory_index + related ## Production tenant For **active_priorities**, **build_progress**, **today_todo**, and **dashboard_version**, the canonical rows in remote D1 use: `tenant_id = ''system''` Session-start queries must filter on this tenant (see `.cursor/rules/session-start-d1-context.',
1351,
'{"client_id":"client_sam_primeaux","knowledge_id":"kb-iam-d1-canonical-keys-20260322","tenant_id":"tenant_sam_primeaux"}',
0,
unixepoch()
);
