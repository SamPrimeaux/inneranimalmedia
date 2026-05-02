-- Session sync 2026-03-22 — agent_memory_index + roadmap_steps
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-sync-session-2026-03-22.sql

UPDATE agent_memory_index
SET value = 'LAST SYNC: 2026-03-22. Worker inneranimalmedia: webhooks 8 endpoints + 15 hook_subscriptions live; GitHub webhook_events + hook_executions verified (hks_gh_event, status success). Cron 6am UTC: RAG chain + webhook_events cleanup + webhook_event_stats rollup. Builtins: CloudConvert + Meshy; d1_write agent_memory_index INSERT guard. Secrets: INTERNAL_API_SECRET vs INTERNAL_WEBHOOK_SECRET split for internal routes vs webhooks. Infra: cicd_runs, deployment_tracking, webhook_event_stats; Solarized Dark theme D1; TURN; Chrome DevTools MCP tools; PTY ecosystem repaired. Morning brief: scripts/send-morning-brief-email.mjs (Resend default schedule today 8:30am America/Chicago). Plan doc: docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md. TOP 3 NEXT: (1) Terminal sessionId / FloatingPreviewPanel WS vs worker. (2) SettingsPanel.jsx Cursor-parity (env, agents, tools, webhooks, deploy, Cursor tab). (3) Agent Sam polish: dock bar CSS vars, icons, multi-panel, welcome cards; bump v after R2.',
    updated_at = unixepoch()
WHERE tenant_id = 'system' AND key = 'active_priorities';

UPDATE agent_memory_index
SET value = 'Roughly 12+ roadmap steps completed under plan_iam_dashboard_v1 (auth through daily digest, MCP, Playwright, etc.). New infra not all as roadmap rows: full webhook platform (8 sources), hook pipeline, D1 analytics tables, 37+ secrets + vault alignment, hook_executions success semantics. IN PROGRESS: terminal session persistence, SettingsPanel overhaul, R2 UI panel, memory retrieval, cost tracking, progress UI, Monaco. NOT STARTED: exit codes, CI/CD completion UI, Vertex, client dashboard, billing, SaaS. Production bundle: dashboard_versions table latest agent v120 (js/css/html rows); dashboard/agent.html may use ?v=122 until next deploy-with-record R2 sync.',
    updated_at = unixepoch()
WHERE tenant_id = 'system' AND key = 'build_progress';

INSERT OR REPLACE INTO agent_memory_index (id, tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at)
VALUES (
  'ami_dashboard_version_note',
  'system',
  'agent-sam-primary',
  'user_context',
  'dashboard_version',
  'dashboard_versions D1: latest production agent bundle v120 (agent + agent-css + agent-html rows). HTML cache-bust query param on dashboard/agent.html may read v122 in repo until next R2 upload + deploy-with-record. See scripts/deploy-with-record.sh for logging.',
  7,
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO agent_memory_index (id, tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at)
VALUES (
  'ami_today_todo_20260322',
  'system',
  'agent-sam-primary',
  'user_context',
  'today_todo',
  '1) Sprint1: Fix terminal sessionId (grep FloatingPreviewPanel + worker runTerminalCommand; align WS registration key). 2) Sprint2: SettingsPanel two-column nav + live saves + tabs Environment/Agents/Providers/Webhooks/Deploy/Cursor. 3) Sprint3: Agent dock CSS vars, icon states, multi-panel tabs, welcome cards; v123 after R2. Reference: docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md',
  9,
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO roadmap_steps (id, plan_id, tenant_id, title, description, status, order_index, created_at, updated_at)
VALUES (
  'step_mar23_ui_sprint',
  'plan_iam_dashboard_v1',
  'tenant_sam_primeaux',
  'Mar 23 sprint — terminal, Settings control plane, Agent polish',
  'docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md. Blocks: terminal session before relying on shell state. SettingsPanel.jsx is primary file. agent.html v bump after R2 only.',
  'in_progress',
  22,
  datetime('now'),
  datetime('now')
);
