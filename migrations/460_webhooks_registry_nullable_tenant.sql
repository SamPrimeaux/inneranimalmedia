-- Platform registry endpoints: tenant_id may be NULL (resolved at ingest from payload/auth).
PRAGMA foreign_keys = OFF;

CREATE TABLE agentsam_webhooks__new (
  id TEXT PRIMARY KEY DEFAULT ('awh_' || lower(hex(randomblob(6)))),
  tenant_id TEXT,
  workspace_id TEXT,
  user_id TEXT,
  provider TEXT NOT NULL CHECK(provider IN (
    'github','stripe','cursor','cloudflare','resend',
    'supabase','vercel','openai','anthropic','google',
    'notion','figma','custom','internal'
  )),
  provider_webhook_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  endpoint_url TEXT NOT NULL,
  signature_header TEXT DEFAULT 'X-Hub-Signature-256',
  signature_algo TEXT DEFAULT 'sha256',
  is_active INTEGER DEFAULT 1,
  allowed_events TEXT,
  workflow_key TEXT,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO agentsam_webhooks__new (
  id, tenant_id, workspace_id, user_id, provider, provider_webhook_id,
  name, slug, description, endpoint_url, signature_header, signature_algo,
  is_active, allowed_events, workflow_key, metadata_json, created_at, updated_at
)
SELECT
  id, tenant_id, workspace_id, user_id, provider, provider_webhook_id,
  name, slug, description, endpoint_url, signature_header, signature_algo,
  is_active, allowed_events, workflow_key, metadata_json, created_at, updated_at
FROM agentsam_webhooks;

DROP TABLE agentsam_webhooks;
ALTER TABLE agentsam_webhooks__new RENAME TO agentsam_webhooks;

PRAGMA foreign_keys = ON;
