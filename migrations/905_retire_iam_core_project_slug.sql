-- 905: Retire legacy project slug iam-core — canonical is projects.id = inneranimalmedia.
-- Migration 832 already did this once; later ticket seeds (840+) reintroduced iam-core.

UPDATE agentsam_tickets
SET project = 'inneranimalmedia',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE project = 'iam-core';

-- No projects row ever existed for iam-core; ensure none can be created as a zombie.
DELETE FROM projects WHERE id = 'iam-core';
