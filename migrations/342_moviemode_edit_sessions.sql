-- 342: KV-backed edit session mirror (optional D1 persistence for MovieMode Remotion pipeline).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/342_moviemode_edit_sessions.sql

CREATE TABLE IF NOT EXISTS moviemode_edit_sessions (
  id TEXT PRIMARY KEY DEFAULT ('mms_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  tenant_id TEXT,
  session_name TEXT NOT NULL DEFAULT 'Untitled Edit',
  clips_json TEXT NOT NULL DEFAULT '[]',
  overlays_json TEXT NOT NULL DEFAULT '[]',
  export_config TEXT NOT NULL DEFAULT '{}',
  last_export_r2 TEXT,
  remotion_bundle_url TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','exported','archived')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_mms_workspace ON moviemode_edit_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_mms_tenant ON moviemode_edit_sessions(tenant_id);
