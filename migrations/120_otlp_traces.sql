-- 120: otlp_traces — OTLP trace span ingest for /api/telemetry/v1/traces
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/120_otlp_traces.sql
-- Purpose: Store OpenTelemetry spans from Workers (D1, R2, DO, HTTP) for observability.

CREATE TABLE IF NOT EXISTS otlp_traces (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  operation_name TEXT NOT NULL,
  service_name TEXT,
  worker_name TEXT,
  kind TEXT NOT NULL,
  status_code TEXT,
  status_message TEXT,
  start_time_unix_nano INTEGER NOT NULL,
  end_time_unix_nano INTEGER NOT NULL,
  attributes_json TEXT,
  events_json TEXT,
  resource_json TEXT,
  binding_type TEXT,
  binding_name TEXT,
  http_method TEXT,
  http_status INTEGER,
  http_url TEXT,
  d1_query TEXT,
  d1_rows_read INTEGER,
  d1_rows_written INTEGER,
  r2_operation TEXT,
  r2_bucket TEXT,
  r2_key TEXT,
  do_class TEXT,
  do_method TEXT,
  batch_id TEXT,
  workspace_id TEXT NOT NULL DEFAULT 'ws_samprimeaux'
);

CREATE INDEX IF NOT EXISTS idx_otlp_traces_trace_id ON otlp_traces(trace_id);
CREATE INDEX IF NOT EXISTS idx_otlp_traces_worker_start ON otlp_traces(worker_name, start_time_unix_nano);
CREATE INDEX IF NOT EXISTS idx_otlp_traces_workspace_start ON otlp_traces(workspace_id, start_time_unix_nano);
