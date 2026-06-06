-- 593: agentsam_artifacts — r2_bucket, scope, expires_at + surgical backfill + junk purge.
-- DEFAULT 'artifacts' = all NEW writes + rows with unproven bucket identity (honest uncertainty).
-- No blind prefix-only backfill — every UPDATE has source or r2_key proof.
-- D1 SQLite has no ADD COLUMN IF NOT EXISTS; skip ALTER if column already present.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/593_agentsam_artifacts_r2_scope.sql
--
-- Prod note: if an interim blind-prefix 593 ran first, apply 595_agentsam_artifacts_r2_bucket_surgical_reconcile.sql.

-- 1. Add columns
ALTER TABLE agentsam_artifacts ADD COLUMN r2_bucket TEXT NOT NULL DEFAULT 'artifacts';
ALTER TABLE agentsam_artifacts ADD COLUMN scope TEXT NOT NULL DEFAULT 'user';
ALTER TABLE agentsam_artifacts ADD COLUMN expires_at INTEGER;

-- 2. Backfill ONLY rows with proven bucket identity (source or r2_key)
UPDATE agentsam_artifacts SET r2_bucket = 'inneranimalmedia-autorag'
  WHERE source = 'agentsam_plan'
     OR r2_key LIKE 'workspaces/au_%'
     OR r2_key LIKE 'agentsam/plans/%';

UPDATE agentsam_artifacts SET r2_bucket = 'inneranimalmedia'
  WHERE source IN ('agentsam_cms_3_theme_matrix', 'cms_live_editor_e2e_validation', 'agent_meauxbility_direct_openai')
     OR source LIKE 'tmp/agent-matrix/%'
     OR source LIKE 'tmp/agent-pinstest/%'
     OR r2_key LIKE 'cms/%'
     OR r2_key LIKE 'analytics/%';

UPDATE agentsam_artifacts SET r2_bucket = 'inneranimalmedia-autorag'
  WHERE source = 'claude_design';

-- 3. Delete confirmed junk (empty key / tombstone agent_response rows)
DELETE FROM agentsam_artifacts
  WHERE source IN ('agent_response', 'agent_response_orphaned')
    AND (r2_key = '' OR r2_key LIKE 'artifacts/rebuilt/missing-r2-key/%');

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_artifacts_tenant_created
  ON agentsam_artifacts(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifacts_workspace_type
  ON agentsam_artifacts(workspace_id, artifact_type);

CREATE INDEX IF NOT EXISTS idx_artifacts_expires
  ON agentsam_artifacts(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artifacts_user_created
  ON agentsam_artifacts(user_id, created_at DESC);
