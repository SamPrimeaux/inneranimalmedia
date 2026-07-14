-- Wave 2: pgvector SSOT → Vectorize replica outbox (Worker consumer).
-- status: pending | syncing | synced | failed | dead

CREATE TABLE IF NOT EXISTS agentsam.agentsam_vector_sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  source_table text NOT NULL,
  source_id text NOT NULL,
  vector_index text NOT NULL,
  operation text NOT NULL DEFAULT 'upsert'
    CHECK (operation IN ('upsert', 'delete')),
  content_hash text,
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-large',
  embedding_dims integer NOT NULL DEFAULT 1536,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'syncing', 'synced', 'failed', 'dead')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz,
  UNIQUE (source_table, source_id, vector_index, operation)
);

CREATE INDEX IF NOT EXISTS agentsam_vector_sync_outbox_drain_idx
  ON agentsam.agentsam_vector_sync_outbox (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE agentsam.agentsam_vector_sync_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON agentsam.agentsam_vector_sync_outbox;
CREATE POLICY "service_role_full_access" ON agentsam.agentsam_vector_sync_outbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE agentsam.agentsam_vector_sync_outbox IS
  'Outbox: pgvector authoritative embeds → Vectorize replica. Worker drains via Hyperdrive.';
