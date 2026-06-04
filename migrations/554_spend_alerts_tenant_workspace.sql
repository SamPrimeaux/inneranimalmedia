-- spend_alerts: scope + dedup key for workspace_limits.spend_alerts worker hook.
ALTER TABLE spend_alerts ADD COLUMN tenant_id TEXT;
ALTER TABLE spend_alerts ADD COLUMN workspace_id TEXT;
ALTER TABLE spend_alerts ADD COLUMN alert_key TEXT;

CREATE INDEX IF NOT EXISTS idx_spend_alerts_tenant_resolved
  ON spend_alerts(tenant_id, resolved, created_at);

CREATE INDEX IF NOT EXISTS idx_spend_alerts_workspace_alert_key
  ON spend_alerts(workspace_id, alert_key, resolved);
