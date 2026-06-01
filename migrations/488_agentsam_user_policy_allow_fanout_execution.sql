-- Add fanout execution policy bit (default OFF).
-- This gates whether multitask actually executes subagent fanout; spawning permission remains allow_subagent_spawn.

ALTER TABLE agentsam_user_policy
ADD COLUMN allow_fanout_execution INTEGER NOT NULL DEFAULT 0;

-- Enable for users who already have explicit subagent spawn grants with depth >= 2.
-- This is intentionally conservative: it upgrades only existing deliberate grants.
UPDATE agentsam_user_policy
SET allow_fanout_execution = 1
WHERE allow_subagent_spawn = 1
  AND COALESCE(max_spawn_depth, 1) >= 2;

