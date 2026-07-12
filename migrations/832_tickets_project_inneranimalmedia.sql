-- 832: Retarget platform tickets from legacy slug iam-core → projects.id inneranimalmedia.
-- iam-core was never a projects row; canonical IAM product project is id=inneranimalmedia.

UPDATE agentsam_tickets
SET project = 'inneranimalmedia',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE project = 'iam-core';
