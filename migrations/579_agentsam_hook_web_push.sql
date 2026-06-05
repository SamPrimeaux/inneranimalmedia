-- Web Push subscriptions live in agentsam_hook (handler_type = web_push).
-- Upsert by hook_key per tenant; no separate push_subscriptions table.

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_hook_key_unique
  ON agentsam_hook(tenant_id, hook_key)
  WHERE hook_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_event_type_active
  ON agentsam_hook(tenant_id, event_type, is_active)
  WHERE is_active = 1;
