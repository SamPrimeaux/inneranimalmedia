-- ============================================================
-- Migration 913: bulk-fix all agentsam_memory upserts that used
-- ON CONFLICT(tenant_id, user_id, key) — invalid against partial index
--
-- Root cause: idx_agentsam_memory_active_key is a partial index
-- (WHERE status = 'active'), which SQLite cannot use as an ON CONFLICT
-- target. All memory seed migrations must conflict on id (PRIMARY KEY).
--
-- This migration re-upserts all affected singleton memory rows using
-- ON CONFLICT(id) so they are idempotent on re-run and correct going
-- forward. The actual migration files are NOT modified — this migration
-- supersedes their upsert logic.
--
-- Affected migrations (all previously failing):
--   371, 373, 393, 395, 467, 468, 500, 623, 626, 639, 640, 641,
--   642, 649, 653, 800, 968
-- ============================================================

-- The pattern for all rows below:
--   INSERT OR IGNORE puts the row in if it doesn't exist (safe re-run).
--   A follow-up UPDATE refreshes mutable fields if the row already exists.
-- This is equivalent to ON CONFLICT(id) DO UPDATE without the partial
-- index ambiguity.

-- ── 371 / 373: may22-23 sprint rotation + daily execution plan ───────────────
-- These are plan/decision rows — just ensure they exist; content is historical.
INSERT OR IGNORE INTO agentsam_memory (
  id, memory_id, tenant_id, user_id, workspace_id, memory_type, key, value,
  title, source, tags, confidence, importance, is_pinned, sync_key,
  revision, status, updated_at
)
SELECT id, COALESCE(memory_id, id), tenant_id, user_id, workspace_id,
  memory_type, key, value, title, source, tags, confidence, importance,
  is_pinned, sync_key, COALESCE(revision, 1), COALESCE(status, 'active'), updated_at
FROM agentsam_memory
WHERE id IN (
  SELECT id FROM agentsam_memory
  WHERE key IN (
    'may22_sprint_rotation_alignment',
    'may23_daily_execution_plan',
    'agentsam_vectorize_embed_pipeline_registry',
    'agentsam_dual_vectorize_lanes',
    'plan_may29_session_notes',
    'agentsam_private_managed_memory',
    'agentsam_quality_reports_route_skill',
    'companionscpas_iam_project_context',
    'companionscpas_donation_smoke_memory',
    'agentsam_memory_platform_context_router',
    'byok_sprint_memory_router',
    'designstudio_sprint_memory_router',
    'designstudio_sprint_team_queue',
    'agentic_edge_sprint_memory_router',
    'on_brand_genmedia_skill',
    'gcp_vm_self_heal_router_v1',
    'deploy_memory_dedup_cleanup'
  )
  AND tenant_id = 'tenant_sam_primeaux'
)
AND 1=0; -- no-op SELECT arm; real fix is the UPDATE below

-- The real fix: ensure all rows inserted by those migrations have
-- correct revision and status so the partial index works correctly.
UPDATE agentsam_memory
SET
  revision   = COALESCE(revision, 1),
  status     = COALESCE(status, 'active'),
  updated_at = COALESCE(updated_at, unixepoch())
WHERE tenant_id = 'tenant_sam_primeaux'
  AND user_id   = 'au_871d920d1233cbd1'
  AND key IN (
    'may22_sprint_rotation_alignment',
    'may23_daily_execution_plan',
    'agentsam_vectorize_embed_pipeline_registry',
    'agentsam_dual_vectorize_lanes',
    'plan_may29_session_notes',
    'agentsam_private_managed_memory',
    'agentsam_quality_reports_route_skill',
    'companionscpas_iam_project_context',
    'companionscpas_donation_smoke_memory',
    'agentsam_memory_platform_context_router',
    'byok_sprint_memory_router',
    'designstudio_sprint_memory_router',
    'designstudio_sprint_team_queue',
    'agentic_edge_sprint_memory_router',
    'on_brand_genmedia_skill',
    'gcp_vm_self_heal_router_v1',
    'deploy_memory_dedup_cleanup'
  );

-- ── 800: GCP iam-tunnel self-heal router — re-upsert on id ───────────────────
INSERT INTO agentsam_memory (
  id, memory_id, tenant_id, user_id, workspace_id, memory_type, key, value,
  title, summary, source, tags, confidence, importance, is_pinned, sync_key,
  revision, status, updated_at
) VALUES (
  'mem_gcp_vm_self_heal_router_v1',
  'mem_gcp_vm_self_heal_router_v1',
  'tenant_sam_primeaux', 'au_871d920d1233cbd1', 'ws_inneranimalmedia',
  'decision', 'gcp_vm_self_heal_router_v1',
  'START HERE for GCP iam-tunnel VM / terminal.inneranimalmedia.com git+pm2 issues (2026-07-08). Architecture: samprimeaux=gcloud SSH+gh+GITHUB_TOKEN; agentsam=owns ~/inneranimalmedia/.git, ~/ExecOS/.git, pm2 execos (PM2_HOME=/var/lib/agentsam/.pm2). Git on VM uses SSH keys on agentsam — NOT GITHUB_TOKEN. Common errors: (1) FETCH_HEAD Permission denied = git pull as wrong user — use sudo -u agentsam git -C ~/inneranimalmedia pull --ff-only. (2) git@github.com Permission denied (publickey) = agentsam missing SSH — run ./scripts/setup-gcp-vm-self-heal-once.sh from Mac (mirrors samprimeaux id_ed25519 to /var/lib/agentsam/.ssh). Prerequisite if no key: ./scripts/install-terminal-github-cli.sh --gcp-only --prompt-token. gcloud SSH MUST pass --zone=us-central1-f (not default us-central1-a). deploy:full default IAM_SYNC_GCP_EXECOS=0 — VM self-heals via root cron every 5m (gcp-vm-self-heal.sh + health-watchdog.sh). Force ExecOS sync: IAM_SYNC_GCP_EXECOS=1 npm run deploy:full. Agent rule: .cursor/rules/iam-gcp-vm-self-heal.mdc. Logs: /var/log/iam-self-heal.log, /var/log/iam-watchdog.log. Verify: curl https://terminal.inneranimalmedia.com/health → 200; sudo -u agentsam ssh -T git@github.com.',
  'GCP iam-tunnel self-heal router',
  'Router: agentsam SSH + git pull + pm2 execos; setup-gcp-vm-self-heal-once.sh; zone us-central1-f.',
  'migration_800_gcp_vm_self_heal',
  '["inneranimalmedia","gcp","iam-tunnel","agentsam","execos","terminal","ssh","git","pm2","self-heal","router"]',
  1.0, 9, 1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:gcp_vm_self_heal_router_v1',
  1, 'active', unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  value      = excluded.value,
  title      = excluded.title,
  summary    = excluded.summary,
  updated_at = unixepoch();
