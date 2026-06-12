-- MovieMode / media asset substrate for Remotion pipeline (D1 canonical).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/341_moviemode_media_backend.sql

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY DEFAULT ('asset_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  source_kind TEXT NOT NULL DEFAULT 'r2',
  source_uri TEXT,
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  media_kind TEXT NOT NULL DEFAULT 'unknown',
  size_bytes INTEGER,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  fps REAL,
  frame_count INTEGER,
  checksum_sha256 TEXT,
  etag TEXT,
  status TEXT NOT NULL DEFAULT 'registered',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, bucket, object_key),
  CHECK (media_kind IN ('video','image','audio','text','binary','unknown')),
  CHECK (status IN ('registered','uploaded','analyzing','ready','failed','archived'))
);

CREATE TABLE IF NOT EXISTS media_scenes (
  id TEXT PRIMARY KEY DEFAULT ('scene_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  project_id TEXT,
  start_ms INTEGER NOT NULL DEFAULT 0,
  end_ms INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  description TEXT,
  transcript_text TEXT,
  motion_score REAL,
  quality_score REAL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  objects_json TEXT NOT NULL DEFAULT '[]',
  analysis_model TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (asset_id) REFERENCES media_assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS moviemode_projects (
  id TEXT PRIMARY KEY DEFAULT ('mmproj_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  client_name TEXT,
  brief_text TEXT,
  brand_json TEXT NOT NULL DEFAULT '{}',
  target_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  r2_prefix TEXT,
  plan_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, slug),
  CHECK (status IN ('draft','planning','approved','rendering','complete','failed','archived'))
);

CREATE TABLE IF NOT EXISTS moviemode_timelines (
  id TEXT PRIMARY KEY DEFAULT ('mmtl_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  renderer TEXT NOT NULL DEFAULT 'remotion',
  fps INTEGER NOT NULL DEFAULT 30,
  width INTEGER NOT NULL DEFAULT 1920,
  height INTEGER NOT NULL DEFAULT 1080,
  duration_frames INTEGER,
  timeline_json TEXT NOT NULL DEFAULT '{}',
  approval_status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES moviemode_projects(id) ON DELETE CASCADE,
  CHECK (renderer IN ('remotion','moviepy','ffmpeg','hybrid')),
  CHECK (status IN ('draft','generated','approved','rendered','superseded','failed')),
  CHECK (approval_status IN ('pending','approved','rejected','needs_changes'))
);

CREATE TABLE IF NOT EXISTS moviemode_render_jobs (
  id TEXT PRIMARY KEY DEFAULT ('mmrender_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  timeline_id TEXT,
  renderer TEXT NOT NULL DEFAULT 'remotion',
  status TEXT NOT NULL DEFAULT 'queued',
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  progress_pct REAL NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES moviemode_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (timeline_id) REFERENCES moviemode_timelines(id) ON DELETE SET NULL,
  CHECK (renderer IN ('remotion','moviepy','ffmpeg','hybrid')),
  CHECK (status IN ('queued','running','complete','failed','cancelled'))
);

CREATE TABLE IF NOT EXISTS moviemode_exports (
  id TEXT PRIMARY KEY DEFAULT ('mmexp_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  render_job_id TEXT,
  variant_type TEXT NOT NULL,
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  public_url TEXT,
  content_type TEXT,
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  fps REAL,
  has_audio INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES moviemode_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (render_job_id) REFERENCES moviemode_render_jobs(id) ON DELETE SET NULL,
  UNIQUE(workspace_id, bucket, object_key),
  CHECK (variant_type IN ('master_music','master_silent','hero_loop','reel','short','vertical','thumbnail','poster','custom')),
  CHECK (status IN ('ready','published','attached','failed','archived'))
);

CREATE INDEX IF NOT EXISTS idx_media_assets_workspace_project ON media_assets(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_kind_status ON media_assets(media_kind, status);
CREATE INDEX IF NOT EXISTS idx_media_scenes_asset ON media_scenes(asset_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_moviemode_projects_workspace ON moviemode_projects(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_moviemode_timelines_project ON moviemode_timelines(project_id, version);
CREATE INDEX IF NOT EXISTS idx_moviemode_render_jobs_project_status ON moviemode_render_jobs(project_id, status);
CREATE INDEX IF NOT EXISTS idx_moviemode_exports_project_variant ON moviemode_exports(project_id, variant_type);
