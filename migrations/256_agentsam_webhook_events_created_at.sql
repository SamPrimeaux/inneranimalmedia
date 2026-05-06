-- Add created_at virtual column to agentsam_webhook_events
-- Maps to received_at for query compatibility
ALTER TABLE agentsam_webhook_events
  ADD COLUMN created_at TEXT GENERATED ALWAYS AS (received_at) VIRTUAL;
