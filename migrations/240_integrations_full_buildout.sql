CREATE TABLE IF NOT EXISTS integration_registry (
  id TEXT PRIMARY KEY DEFAULT ('int_'||lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'source_control','storage','ai_provider','communication',
    'database','analytics','payment','deployment','automation','other'
  )),
  auth_type TEXT NOT NULL CHECK(auth_type IN (
    'oauth2','api_key','webhook','worker_binding','none'
  )),
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN (
    'connected','disconnected','degraded','auth_expired','pending'
  )),
  scopes_json TEXT DEFAULT '[]',
  config_json TEXT DEFAULT '{}',
  account_display TEXT,
  secret_binding_name TEXT,
  last_sync_at TEXT,
  last_health_check_at TEXT,
  last_health_latency_ms INTEGER,
  last_health_status TEXT,
  is_enabled INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 50,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, provider_key)
);

CREATE TABLE IF NOT EXISTS integration_health_checks (
  id TEXT PRIMARY KEY DEFAULT ('ihc_'||lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL CHECK(status IN ('ok','degraded','error','timeout')),
  latency_ms INTEGER,
  error_message TEXT,
  checked_by TEXT DEFAULT 'system',
  response_preview TEXT
);

CREATE TABLE IF NOT EXISTS integration_events (
  id TEXT PRIMARY KEY DEFAULT ('iev_'||lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'connected','disconnected','token_refreshed','sync_completed',
    'health_check','test_run','webhook_received','error','settings_updated'
  )),
  actor TEXT,
  message TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_api_keys (
  id TEXT PRIMARY KEY DEFAULT ('uak_'||lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  key_name TEXT NOT NULL,
  key_preview TEXT,
  key_hash TEXT,
  is_active INTEGER DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_integration_registry_tenant_status
  ON integration_registry(tenant_id, status, is_enabled);
CREATE INDEX IF NOT EXISTS idx_integration_health_provider_time
  ON integration_health_checks(tenant_id, provider_key, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_events_tenant_time
  ON integration_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_tenant_user_provider
  ON user_api_keys(tenant_id, user_id, provider, is_active);

INSERT OR IGNORE INTO integration_registry
  (id, tenant_id, provider_key, display_name, category, auth_type, status, sort_order, secret_binding_name) VALUES
  ('int_github','tenant_sam_primeaux','github','GitHub','source_control','oauth2','connected',10,NULL),
  ('int_google_drive','tenant_sam_primeaux','google_drive','Google Drive','storage','oauth2','connected',20,NULL),
  ('int_cloudflare_r2','tenant_sam_primeaux','cloudflare_r2','Cloudflare R2','storage','worker_binding','connected',30,'R2'),
  ('int_mcp','tenant_sam_primeaux','mcp_servers','MCP Servers','automation','api_key','connected',40,NULL),
  ('int_resend','tenant_sam_primeaux','resend','Resend','communication','api_key','connected',50,'RESEND_API_KEY'),
  ('int_anthropic','tenant_sam_primeaux','anthropic','Anthropic','ai_provider','api_key','connected',60,'ANTHROPIC_API_KEY'),
  ('int_openai','tenant_sam_primeaux','openai','OpenAI','ai_provider','api_key','connected',70,'OPENAI_API_KEY'),
  ('int_google_ai','tenant_sam_primeaux','google_ai','Google AI','ai_provider','api_key','connected',80,'GOOGLE_AI_API_KEY'),
  ('int_bluebubbles','tenant_sam_primeaux','bluebubbles','BlueBubbles','communication','webhook','connected',90,'BLUEBUBBLES_WEBHOOK_SECRET'),
  ('int_cloudflare_images','tenant_sam_primeaux','cloudflare_images','Cloudflare Images','storage','worker_binding','connected',100,'CLOUDFLARE_IMAGES_ACCOUNT_HASH'),
  ('int_vectorize','tenant_sam_primeaux','vectorize','Vectorize','analytics','worker_binding','connected',110,'VECTORIZE'),
  ('int_hyperdrive','tenant_sam_primeaux','hyperdrive','Hyperdrive (Supabase)','database','worker_binding','connected',120,'HYPERDRIVE'),
  ('int_browser_rendering','tenant_sam_primeaux','browser_rendering','Browser Rendering','automation','worker_binding','connected',130,'MYBROWSER'),
  ('int_supabase','tenant_sam_primeaux','supabase','Supabase','database','api_key','connected',140,'SUPABASE_SERVICE_ROLE_KEY'),
  ('int_cursor','tenant_sam_primeaux','cursor','Cursor','automation','api_key','connected',150,'CURSOR_API_KEY'),
  ('int_claude_code','tenant_sam_primeaux','claude_code','Claude Code','automation','api_key','disconnected',160,'CLAUDE_CODE_API_KEY');
