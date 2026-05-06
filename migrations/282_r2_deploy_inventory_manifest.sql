-- R2 deploy manifest + extended inventory; Connor leadership-legacy ownership fix.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/282_r2_deploy_inventory_manifest.sql
--
-- Before CREATE UNIQUE INDEX: run scripts/r2-inventory-duplicate-check.sql — if duplicates exist, dedupe first.
-- ALTER ADD COLUMN is not idempotent; re-running this file after partial apply may error — normal for D1 one-shot migrations.

-- ── r2_object_inventory: deploy / tenancy / lifecycle ───────────────────────
ALTER TABLE r2_object_inventory ADD COLUMN tenant_id TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN workspace_id TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN project_id TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN deploy_id TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN deploy_tag TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN source_manifest_id TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE r2_object_inventory ADD COLUMN first_seen_at TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN last_seen_at TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN last_seen_deploy_id TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN stale_since TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN prune_after TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN protected INTEGER DEFAULT 0;
ALTER TABLE r2_object_inventory ADD COLUMN protected_reason TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN cache_control TEXT;
ALTER TABLE r2_object_inventory ADD COLUMN content_hash TEXT;

-- Stable upsert target for inventory scripts (fails if duplicate legacy rows exist — dedupe first).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_r2_inventory_bucket_object ON r2_object_inventory(bucket_name, object_key);

-- ── Manifest tables ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS r2_deploy_manifests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  site_slug TEXT,
  deploy_id TEXT NOT NULL,
  deploy_tag TEXT,
  source TEXT NOT NULL DEFAULT 'deploy',
  manifest_json TEXT NOT NULL DEFAULT '{}',
  object_count INTEGER NOT NULL DEFAULT 0,
  total_size_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'created',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  applied_at TEXT
);

CREATE TABLE IF NOT EXISTS r2_deploy_manifest_objects (
  id TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size_bytes INTEGER DEFAULT 0,
  content_type TEXT,
  etag TEXT,
  sha256_hash TEXT,
  r2_public_url TEXT,
  live_url TEXT,
  status TEXT DEFAULT 'expected',
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(manifest_id, bucket_name, object_key)
);

CREATE INDEX IF NOT EXISTS idx_r2_object_inventory_bucket_status
  ON r2_object_inventory(bucket_name, status);
CREATE INDEX IF NOT EXISTS idx_r2_object_inventory_tenant_workspace_project
  ON r2_object_inventory(tenant_id, workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_r2_object_inventory_bucket_object_key
  ON r2_object_inventory(bucket_name, object_key);
CREATE INDEX IF NOT EXISTS idx_r2_object_inventory_last_seen_deploy
  ON r2_object_inventory(last_seen_deploy_id);
CREATE INDEX IF NOT EXISTS idx_r2_deploy_manifests_bucket_ws_proj_created
  ON r2_deploy_manifests(bucket_name, workspace_id, project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_r2_deploy_manifest_objects_manifest_bucket_key
  ON r2_deploy_manifest_objects(manifest_id, bucket_name, object_key);

-- ── Ownership: leadership-legacy → Connor ─────────────────────────────────────
UPDATE r2_object_inventory SET
  tenant_id = 'tenant_connor_mcneely',
  workspace_id = 'ws_connor_mcneely',
  project_id = 'leadership-legacy',
  edited_by = 'au_5d17673408aaebc7'
WHERE bucket_name = 'leadership-legacy';
