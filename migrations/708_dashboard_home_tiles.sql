-- Dashboard home quick-start tiles (workspace-scoped, editable via /api/dashboard/home).
-- Fallback: rows with workspace_id = 'platform_default' apply when a workspace has no custom rows.

CREATE TABLE IF NOT EXISTS dashboard_home_tiles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tile_key TEXT NOT NULL,
  title TEXT NOT NULL,
  cta_label TEXT NOT NULL DEFAULT 'Open',
  path TEXT NOT NULL,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (workspace_id, tile_key)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_home_tiles_ws_sort
  ON dashboard_home_tiles (workspace_id, sort_order, tile_key);

INSERT OR IGNORE INTO dashboard_home_tiles (
  id, workspace_id, tile_key, title, cta_label, path, image_url, sort_order, is_enabled
) VALUES
  (
    'dht_platform_agent_sam',
    'platform_default',
    'agent_sam',
    'Agent Sam',
    'Chat',
    '/dashboard/agent',
    'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/b5557284-485e-4305-2c5a-49c6acf99a00/public',
    10,
    1
  ),
  (
    'dht_platform_design_studio',
    'platform_default',
    'design_studio',
    'Design Studio',
    'Build',
    '/dashboard/designstudio',
    'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/b5557284-485e-4305-2c5a-49c6acf99a00/public',
    20,
    1
  ),
  (
    'dht_platform_database',
    'platform_default',
    'database',
    'Database',
    'Inspect',
    '/dashboard/database',
    'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/c2eec95d-98c4-48ed-0394-45ae2f632300/public',
    30,
    1
  ),
  (
    'dht_platform_cms',
    'platform_default',
    'cms_suite',
    'CMS Suite',
    'Edit',
    '/dashboard/cms',
    'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/b1d0bd36-0f88-4301-4e68-7e8d5e255b00/public',
    40,
    1
  );
