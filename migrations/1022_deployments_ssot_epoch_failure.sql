-- 1022: deployments SSOT — Law 2 epoch columns + failure diagnosis fields.
-- Filtering/sort must use *_unix. TEXT timestamp/created_at remain for legacy UI dual-write.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/1022_deployments_ssot_epoch_failure.sql

ALTER TABLE deployments ADD COLUMN timestamp_unix INTEGER;
ALTER TABLE deployments ADD COLUMN created_at_unix INTEGER;
ALTER TABLE deployments ADD COLUMN error_message TEXT;
ALTER TABLE deployments ADD COLUMN failure_reason TEXT;

-- Backfill epoch from TEXT wall-clock (assume UTC when no timezone — best-effort).
UPDATE deployments
SET timestamp_unix = COALESCE(
  timestamp_unix,
  CAST(strftime('%s', REPLACE(REPLACE(timestamp, 'T', ' '), 'Z', '')) AS INTEGER),
  CAST(strftime('%s', timestamp) AS INTEGER)
)
WHERE timestamp_unix IS NULL
  AND timestamp IS NOT NULL
  AND TRIM(timestamp) != '';

UPDATE deployments
SET created_at_unix = COALESCE(
  created_at_unix,
  CAST(strftime('%s', REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '')) AS INTEGER),
  CAST(strftime('%s', created_at) AS INTEGER),
  timestamp_unix
)
WHERE created_at_unix IS NULL;

CREATE INDEX IF NOT EXISTS idx_deployments_timestamp_unix
  ON deployments (timestamp_unix DESC);

CREATE INDEX IF NOT EXISTS idx_deployments_worker_ts_unix
  ON deployments (worker_name, timestamp_unix DESC);
