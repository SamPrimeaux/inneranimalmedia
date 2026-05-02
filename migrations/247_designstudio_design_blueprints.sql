-- 247: designstudio_design_blueprints — structured intent between idea and CAD output.
-- Mirror: docs/inneranimalmedia/product/designstudio/design-blueprints-schema.sql
-- Apply only after review: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/247_designstudio_design_blueprints.sql

CREATE TABLE IF NOT EXISTS designstudio_design_blueprints (
  id TEXT PRIMARY KEY DEFAULT ('dsb_' || lower(hex(randomblob(8)))),

  tenant_id TEXT NOT NULL DEFAULT 'tenant_inneranimalmedia',
  workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  project_id TEXT,

  title TEXT NOT NULL,
  description TEXT,
  original_prompt TEXT,

  intent_json TEXT NOT NULL DEFAULT '{}',

  cad_script TEXT,
  cad_engine TEXT DEFAULT 'openscad',

  sketch_json TEXT DEFAULT '{}',
  preview_image_url TEXT,

  generation_config_json TEXT DEFAULT '{}',

  latest_asset_id TEXT,
  latest_run_id TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'structured',
      'generated',
      'validated',
      'exported',
      'failed'
    )),

  quality_score REAL DEFAULT 0,
  success_rate REAL DEFAULT 0,

  tags TEXT DEFAULT '[]',
  notes TEXT,

  total_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  avg_latency_ms REAL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
