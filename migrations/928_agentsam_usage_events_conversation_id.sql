-- 928: Reconcile the usage-event conversation attribution column with Git.
-- Production already had this column from an out-of-band schema change; the
-- migration runner treats an existing ADD COLUMN target as already applied.

ALTER TABLE agentsam_usage_events ADD COLUMN conversation_id TEXT;
