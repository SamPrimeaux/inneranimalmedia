-- 800: Pinned GCP iam-tunnel self-heal memory — agentsam SSH, git pull, pm2, cron.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/800_agentsam_memory_gcp_vm_self_heal.sql

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_gcp_vm_self_heal_router_v1',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'decision',
  'gcp_vm_self_heal_router_v1',
  'START HERE for GCP iam-tunnel VM / terminal.inneranimalmedia.com git+pm2 issues (2026-07-08). Architecture: samprimeaux=gcloud SSH+gh+GITHUB_TOKEN; agentsam=owns ~/inneranimalmedia/.git, ~/ExecOS/.git, pm2 execos (PM2_HOME=/var/lib/agentsam/.pm2). Git on VM uses SSH keys on agentsam — NOT GITHUB_TOKEN. Common errors: (1) FETCH_HEAD Permission denied = git pull as wrong user — use sudo -u agentsam git -C ~/inneranimalmedia pull --ff-only. (2) git@github.com Permission denied (publickey) = agentsam missing SSH — run ./scripts/setup-gcp-vm-self-heal-once.sh from Mac (mirrors samprimeaux id_ed25519 to /var/lib/agentsam/.ssh). Prerequisite if no key: ./scripts/install-terminal-github-cli.sh --gcp-only --prompt-token. gcloud SSH MUST pass --zone=us-central1-f (not default us-central1-a). deploy:full default IAM_SYNC_GCP_EXECOS=0 — VM self-heals via root cron every 5m (gcp-vm-self-heal.sh + health-watchdog.sh). Force ExecOS sync: IAM_SYNC_GCP_EXECOS=1 npm run deploy:full. Agent rule: .cursor/rules/iam-gcp-vm-self-heal.mdc. Logs: /var/log/iam-self-heal.log, /var/log/iam-watchdog.log. Verify: curl https://terminal.inneranimalmedia.com/health → 200; sudo -u agentsam ssh -T git@github.com.',
  'GCP iam-tunnel self-heal router',
  'Router: agentsam SSH + git pull + pm2 execos; setup-gcp-vm-self-heal-once.sh; zone us-central1-f.',
  'migration_800_gcp_vm_self_heal',
  '["inneranimalmedia","gcp","iam-tunnel","agentsam","execos","terminal","ssh","git","pm2","self-heal","router"]',
  1.0,
  9,
  1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:gcp_vm_self_heal_router_v1',
  unixepoch()
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  title = excluded.title,
  summary = excluded.summary,
  workspace_id = excluded.workspace_id,
  memory_type = excluded.memory_type,
  source = excluded.source,
  tags = excluded.tags,
  confidence = excluded.confidence,
  importance = excluded.importance,
  is_pinned = excluded.is_pinned,
  sync_key = excluded.sync_key,
  updated_at = unixepoch();

UPDATE agentsam_project_context
SET
  notes = COALESCE(notes, '') || ' GCP VM self-heal: agentsam_memory.key=gcp_vm_self_heal_router_v1; .cursor/rules/iam-gcp-vm-self-heal.mdc; ./scripts/setup-gcp-vm-self-heal-once.sh.',
  updated_at = unixepoch()
WHERE id = 'ctx_inneranimalmedia'
  AND COALESCE(notes, '') NOT LIKE '%gcp_vm_self_heal_router_v1%';
