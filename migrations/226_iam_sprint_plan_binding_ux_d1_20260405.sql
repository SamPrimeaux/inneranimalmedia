-- 226: Sprint plan IAM binding/UX — sprint_snapshots, project_memory, project_issues, project_goals
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/226_iam_sprint_plan_binding_ux_d1_20260405.sql
-- Doc: docs/SPRINT_PLAN_IAM_BINDING_UX.md | Baseline git: 708e61a

-- Weekly-style snapshot row (manual seed; cron may add more later)
INSERT OR IGNORE INTO sprint_snapshots (
  id,
  snapshot_date,
  week_number,
  notes
) VALUES (
  'snap_iam_binding_ux_20260405',
  date('now'),
  cast(strftime('%W', 'now') AS integer),
  'IAM binding/UX sprint baseline. Repo docs: docs/SPRINT_PLAN_IAM_BINDING_UX.md. D1 keys: project_memory SPRINT_PLAN_IAM_BINDING_UX; project_goals goal_iam_bindux_*; project_issues iss_iam_bindux_*. Completed: prod DASHBOARD->agent-sam; sandbox TOOLS->tools; status bar polling/notifications (708e61a).'
);

INSERT OR REPLACE INTO project_memory (
  id,
  project_id,
  tenant_id,
  memory_type,
  key,
  value,
  importance_score,
  confidence_score,
  created_by,
  created_at,
  updated_at
) VALUES (
  'pmem_iam_sprint_plan_binding_ux_v1',
  'inneranimalmedia',
  'tenant_sam_primeaux',
  'workflow',
  'SPRINT_PLAN_IAM_BINDING_UX',
  '{"version":"1","updated":"2026-04-05","doc_path":"docs/SPRINT_PLAN_IAM_BINDING_UX.md","baseline_commit":"708e61a","completed":["wrangler.production.toml DASHBOARD agent-sam","wrangler.jsonc TOOLS tools","App StatusBar Monaco status wiring","git push main"],"next_days":["Day1 D1 platform_binding_registry + Settings Infrastructure tab","Day2 agent_telemetry routing visibility","Day3 system health pills + deprecate AI_SEARCH UI","Day4 cicd_pipeline_runs Operations v0","Day5 hyperdrive-health endpoint + Settings Data tab"],"backlog":["MCP r2_write repair","terminal user_id auth","Stripe stub","CF Images Stream Calls cards","Meshy CloudConvert tools"],"deploy_flow":"deploy-sandbox.sh then promote-to-prod.sh","rules":["sandbox first","benchmark-full 31/31 before prod promote","no secret values in UI"]}',
  0.95,
  1.0,
  'sprint_plan_226',
  unixepoch(),
  unixepoch()
);

-- Open issues (binding/UX program — not individual bugs)
INSERT OR IGNORE INTO project_issues (id, project_id, severity, category, title, detail, status) VALUES
(
  'iss_iam_bindux_mcp_r2',
  'inneranimalmedia',
  'high',
  'broken_assets',
  'MCP r2_write degraded',
  'High failure rate; excluded from agent modes until repaired. Blocks reliable R2 via MCP.',
  'open'
),
(
  'iss_iam_bindux_agent_docs',
  'inneranimalmedia',
  'med',
  'ui',
  'Session work vs sprint doc drift',
  'Cursor sessions under-documented vs docs/SPRINT_PLAN_IAM_BINDING_UX.md and D1 rows; enforce changelog row per slice.',
  'open'
),
(
  'iss_iam_bindux_queue_metric',
  'inneranimalmedia',
  'med',
  'data',
  'Queue depth not surfaced',
  'MY_QUEUE has no honest depth pill without Queue Events or D1 job log; do not fake metrics in UI.',
  'open'
),
(
  'iss_iam_bindux_postdeploy',
  'inneranimalmedia',
  'low',
  'deploy',
  'Post-deploy knowledge sync Unauthorized',
  'deploy-sandbox.sh curl /api/internal/post-deploy needs INTERNAL_API_SECRET in shell or sourced .env; non-fatal.',
  'open'
),
(
  'iss_iam_bindux_billing_ui',
  'inneranimalmedia',
  'med',
  'billing',
  'Stripe wired, no billing UI',
  'STRIPE_SECRET_KEY active; no in-app summary or portal entry.',
  'open'
);

-- Goals (5-day plan + registry anchor)
INSERT OR IGNORE INTO project_goals (
  id,
  project_id,
  tenant_id,
  goal_name,
  goal_description,
  goal_type,
  success_criteria,
  current_progress_percent,
  status,
  priority,
  created_by
) VALUES
(
  'goal_iam_bindux_d1_registry',
  'inneranimalmedia',
  'tenant_sam_primeaux',
  'Platform binding registry in D1 + Settings Infrastructure tab',
  'Table platform_binding_registry (or equivalent), GET /api/settings/bindings-inventory, read-only UI; names only.',
  'primary',
  'Registry seeded; API returns rows; Settings tab renders on sandbox',
  0,
  'active',
  90,
  'sprint_plan_226'
),
(
  'goal_iam_bindux_routing_viz',
  'inneranimalmedia',
  'tenant_sam_primeaux',
  'LLM routing visibility from agent_telemetry',
  'Settings AI routing tab: model/provider aggregates, last activity, empty state documented.',
  'primary',
  'Rows populate after chat traffic; columns match live schema',
  0,
  'active',
  85,
  'sprint_plan_226'
),
(
  'goal_iam_bindux_system_chrome',
  'inneranimalmedia',
  'tenant_sam_primeaux',
  'System health + deploy truth in chrome',
  'Map /api/system/health to pills; last prod deploy from deployments; remove misleading AI Search labels.',
  'milestone',
  'Pills show -- on failure not spinners; RAG copy points to D1 cosine path',
  0,
  'active',
  80,
  'sprint_plan_226'
),
(
  'goal_iam_bindux_operations_v0',
  'inneranimalmedia',
  'tenant_sam_primeaux',
  'Operations panel v0 (pipeline runs)',
  'cicd_pipeline_runs + cicd_run_steps list with expand; no fake queue depth.',
  'milestone',
  'Sandbox deploy creates visible run in UI',
  0,
  'active',
  75,
  'sprint_plan_226'
),
(
  'goal_iam_bindux_hyperdrive_health',
  'inneranimalmedia',
  'tenant_sam_primeaux',
  'Hyperdrive health check + Settings Data tab',
  'GET /api/system/hyperdrive-health SELECT 1 via HYPERDRIVE; test button; Supabase dashboard link.',
  'milestone',
  'ok and failure paths both visible',
  0,
  'active',
  70,
  'sprint_plan_226'
);
