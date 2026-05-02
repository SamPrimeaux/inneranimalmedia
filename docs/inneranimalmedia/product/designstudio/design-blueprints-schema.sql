-- designstudio_design_blueprints
-- Purpose: structured design intent between user idea and CAD output.
-- Apply via approved D1 migration (do not run ad-hoc on production without review).

CREATE TABLE IF NOT EXISTS designstudio_design_blueprints (
  id TEXT PRIMARY KEY DEFAULT ('dsb_' || lower(hex(randomblob(8)))),

  -- ownership
  tenant_id TEXT NOT NULL DEFAULT 'tenant_inneranimalmedia',
  workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  project_id TEXT,

  -- core idea
  title TEXT NOT NULL,
  description TEXT,
  original_prompt TEXT,

  -- structured design intent (JSON)
  intent_json TEXT NOT NULL DEFAULT '{}',

  /*
    Example intent_json:
    {
      "type": "chess_board",
      "dimensions": { "width": 8, "height": 8, "tile_size": 5 },
      "layers": [
        { "type": "base", "height": 2 },
        { "type": "tiles", "pattern": "checker" }
      ],
      "constraints": [
        { "type": "symmetry", "axis": "both" }
      ]
    }
  */

  -- cad output
  cad_script TEXT,
  cad_engine TEXT DEFAULT 'openscad',

  -- visual + sketch layer
  sketch_json TEXT DEFAULT '{}',
  preview_image_url TEXT,

  -- generation config
  generation_config_json TEXT DEFAULT '{}',

  -- output tracking
  latest_asset_id TEXT,
  latest_run_id TEXT,

  -- status lifecycle
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'structured',
      'generated',
      'validated',
      'exported',
      'failed'
    )),

  -- scoring (learning)
  quality_score REAL DEFAULT 0,
  success_rate REAL DEFAULT 0,

  -- learning hooks
  tags TEXT DEFAULT '[]',
  notes TEXT,

  -- metrics
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  avg_latency_ms REAL DEFAULT 0,

  -- timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Optional: enforce updated_at on write from application or trigger if your D1 policy allows.
