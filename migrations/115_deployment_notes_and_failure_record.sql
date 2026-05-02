-- 115: Add deployment_notes to cloudflare_deployments and record 2026-03-03 dashboard failure
-- Run after revert deploy. Marks the deploy that broke the dashboard (in-worker HTML rewrite).
-- See docs/FAILURE_2026-03-03_DASHBOARD_REVERT.md

ALTER TABLE cloudflare_deployments ADD COLUMN deployment_notes TEXT;

-- Mark the previous deploy (the one that broke the dashboard) with failure note
UPDATE cloudflare_deployments
SET deployment_notes = 'FAILURE: In-worker dashboard HTML rewrite (finance/overview) broke full dashboard. Reverted. See docs/FAILURE_2026-03-03_DASHBOARD_REVERT.md'
WHERE worker_name = 'inneranimalmedia'
  AND rowid = (
    SELECT rowid FROM cloudflare_deployments
    WHERE worker_name = 'inneranimalmedia'
    ORDER BY deployed_at DESC
    LIMIT 1 OFFSET 1
  );
