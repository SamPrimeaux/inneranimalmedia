-- MovieMode lane: platform templates + ffmpeg/CloudConvert job tracking (isolated from cms_* / agentsam_artifacts sprawl).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/617_moviemode_templates_conversions.sql

CREATE TABLE IF NOT EXISTS moviemode_templates (
  id TEXT PRIMARY KEY,
  pack_slug TEXT NOT NULL,
  pack_title TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  template_kind TEXT NOT NULL DEFAULT 'clip'
    CHECK (template_kind IN ('clip', 'timeline', 'pack')),
  scope TEXT NOT NULL DEFAULT 'platform'
    CHECK (scope IN ('platform', 'workspace')),
  workspace_id TEXT,
  tenant_id TEXT,
  stream_uid TEXT,
  stream_hls_url TEXT,
  thumbnail_url TEXT,
  duration_sec REAL,
  timeline_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_free INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'draft')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (pack_slug, slug)
);

CREATE INDEX IF NOT EXISTS idx_moviemode_templates_scope_pack
  ON moviemode_templates(scope, pack_slug, sort_order);
CREATE INDEX IF NOT EXISTS idx_moviemode_templates_workspace
  ON moviemode_templates(workspace_id, pack_slug) WHERE workspace_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS moviemode_conversion_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  source_asset_id TEXT NOT NULL,
  output_asset_id TEXT,
  service TEXT NOT NULL DEFAULT 'ffmpeg'
    CHECK (service IN ('ffmpeg', 'cloudconvert', 'pty')),
  input_format TEXT NOT NULL,
  output_format TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'running', 'complete', 'failed', 'cancelled')),
  external_job_id TEXT,
  result_bucket TEXT,
  result_object_key TEXT,
  error_message TEXT,
  progress_pct REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (project_id) REFERENCES moviemode_projects(id) ON DELETE SET NULL,
  FOREIGN KEY (source_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (output_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_moviemode_conversion_jobs_ws_status
  ON moviemode_conversion_jobs(workspace_id, status, created_at);

CREATE TABLE IF NOT EXISTS moviemode_conversions (
  id TEXT PRIMARY KEY,
  conversion_job_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  source_asset_id TEXT NOT NULL,
  output_asset_id TEXT,
  source_format TEXT NOT NULL,
  target_format TEXT NOT NULL,
  service TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'complete'
    CHECK (status IN ('pending', 'complete', 'failed')),
  external_job_id TEXT,
  output_url TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (conversion_job_id) REFERENCES moviemode_conversion_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (source_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (output_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_moviemode_conversions_job
  ON moviemode_conversions(conversion_job_id);

-- Starter B-Roll pack (Cloudflare Stream — public VOD references)
INSERT OR IGNORE INTO moviemode_templates (
  id, pack_slug, pack_title, slug, title, description, template_kind, scope,
  stream_uid, stream_hls_url, thumbnail_url, duration_sec, metadata_json, sort_order, is_free, status
) VALUES
(
  'mmtmpl_starter_gorrilla_pov',
  'starter-broll',
  'IAM Starter B-Roll (Free)',
  'gorrilla-pov',
  'gorrilla pov',
  'AI gorilla POV b-roll loop — free starter clip for Connor and workspace users.',
  'clip',
  'platform',
  '372d8e5700cd7574ac60a84fe3292293',
  'https://customer-8y3087qnrzz7ql2e.cloudflarestream.com/372d8e5700cd7574ac60a84fe3292293/manifest/video.m3u8',
  'https://customer-8y3087qnrzz7ql2e.cloudflarestream.com/372d8e5700cd7574ac60a84fe3292293/thumbnails/thumbnail.jpg?time=0s&height=360',
  8.0,
  '{"source_filename":"gorrilla pov.mp4","license":"free_starter","stream_public":true}',
  1,
  1,
  'active'
),
(
  'mmtmpl_starter_rain_motorcycle',
  'starter-broll',
  'IAM Starter B-Roll (Free)',
  'rain-motorcycle-ai',
  'rain motorcycle vid - ai',
  'Rain motorcycle AI b-roll — free starter clip.',
  'clip',
  'platform',
  'a7f5bf0f88e31e6fc8405179f6b85680',
  'https://customer-8y3087qnrzz7ql2e.cloudflarestream.com/a7f5bf0f88e31e6fc8405179f6b85680/manifest/video.m3u8',
  'https://customer-8y3087qnrzz7ql2e.cloudflarestream.com/a7f5bf0f88e31e6fc8405179f6b85680/thumbnails/thumbnail.jpg?time=0s&height=360',
  8.0,
  '{"source_filename":"rain motorcycle vid - ai.mp4","license":"free_starter","stream_public":true}',
  2,
  1,
  'active'
),
(
  'mmtmpl_starter_ai_bike_pass',
  'starter-broll',
  'IAM Starter B-Roll (Free)',
  'ai-bike-pass',
  'ai bike pass',
  'AI bike pass b-roll — free starter clip.',
  'clip',
  'platform',
  '5bbe1ddac1a022562c50f32e33193afc',
  'https://customer-8y3087qnrzz7ql2e.cloudflarestream.com/5bbe1ddac1a022562c50f32e33193afc/manifest/video.m3u8',
  'https://customer-8y3087qnrzz7ql2e.cloudflarestream.com/5bbe1ddac1a022562c50f32e33193afc/thumbnails/thumbnail.jpg?time=0s&height=360',
  8.0,
  '{"source_filename":"ai bike pass.mp4","license":"free_starter","stream_public":true}',
  3,
  1,
  'active'
);
