-- 285: otlp_traces — multitenant OTLP span storage (re-created after 280 dropped unused table).
-- No DEFAULT on tenant/workspace — ingest MUST set both from session/auth (never ws_samprimeaux typo).
--
-- Apply remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/285_otlp_traces_multitenant.sql

DROP TABLE IF EXISTS otlp_traces;

CREATE TABLE otlp_traces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
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
  batch_id TEXT
);

CREATE INDEX idx_otlp_traces_trace_id ON otlp_traces(trace_id);
CREATE INDEX idx_otlp_traces_tenant_ws_time ON otlp_traces(tenant_id, workspace_id, start_time_unix_nano);
CREATE INDEX idx_otlp_traces_ws_time ON otlp_traces(workspace_id, start_time_unix_nano);
CREATE INDEX idx_otlp_traces_worker_start ON otlp_traces(worker_name, start_time_unix_nano);
