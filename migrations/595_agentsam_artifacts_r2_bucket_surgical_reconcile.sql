-- 595: Reconcile r2_bucket after interim blind-prefix 593/594 on prod.
-- Re-applies surgical source/r2_key backfill; preserves rows already on artifacts bucket (pilot migrate).
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/595_agentsam_artifacts_r2_bucket_surgical_reconcile.sql

-- Junk purge (idempotent)
DELETE FROM agentsam_artifacts
  WHERE source IN ('agent_response', 'agent_response_orphaned')
    AND (r2_key = '' OR r2_key LIKE 'artifacts/rebuilt/missing-r2-key/%');

-- inneranimalmedia-autorag (proven lane; skip canonical artifacts-bucket keys)
UPDATE agentsam_artifacts SET r2_bucket = 'inneranimalmedia-autorag'
  WHERE r2_key NOT LIKE 'artifacts/%'
    AND (
      source = 'agentsam_plan'
      OR r2_key LIKE 'workspaces/au_%'
      OR r2_key LIKE 'agentsam/plans/%'
      OR source = 'claude_design'
    );

-- inneranimalmedia (proven lane; skip canonical artifacts-bucket keys)
UPDATE agentsam_artifacts SET r2_bucket = 'inneranimalmedia'
  WHERE r2_key NOT LIKE 'artifacts/%'
    AND (
      source IN ('agentsam_cms_3_theme_matrix', 'cms_live_editor_e2e_validation', 'agent_meauxbility_direct_openai')
      OR source LIKE 'tmp/agent-matrix/%'
      OR source LIKE 'tmp/agent-pinstest/%'
      OR r2_key LIKE 'cms/%'
      OR r2_key LIKE 'analytics/%'
    );
