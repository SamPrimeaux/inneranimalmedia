-- 805: agentsam_memory resolved flag — closed blockers stop appearing in daily briefs.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/805_agentsam_memory_resolved_flag.sql

ALTER TABLE agentsam_memory ADD COLUMN is_resolved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agentsam_memory ADD COLUMN resolved_at INTEGER;
ALTER TABLE agentsam_memory ADD COLUMN resolved_by TEXT;

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_active_brief
  ON agentsam_memory(tenant_id, memory_type, updated_at DESC)
  WHERE is_archived = 0 AND is_resolved = 0;
