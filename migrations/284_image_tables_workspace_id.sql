-- Image registry + generation tables: tenant_* and ws_* aware (production multi-tenant).
--
-- Why NOT NULL ADD COLUMN failed on D1:
--   SQLite/D1 rejects `ALTER TABLE ... ADD COLUMN col TEXT NOT NULL` without a DEFAULT,
--   even when the table is empty.
--
-- Approach:
--   1) ADD nullable columns + FK hints (tenant_id / workspace_id).
--   2) Backfill from tenants.workspace_id, workspaces.*, agentsam_workspace, and parent rows.
--   3) Enforce required tenant+workspace on new/changed rows via BEFORE INSERT/UPDATE triggers
--      (strict NOT NULL without table rebuild).
--
-- Apply (remote):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/284_image_tables_workspace_id.sql
--
-- Post-check (should be 0 on every line):
--   SELECT 'images', COUNT(*) FROM images WHERE tenant_id IS NULL OR workspace_id IS NULL
--   UNION ALL SELECT 'image_metadata', COUNT(*) FROM image_metadata WHERE tenant_id IS NULL OR workspace_id IS NULL
--   UNION ALL SELECT 'image_generation_jobs', COUNT(*) FROM image_generation_jobs WHERE tenant_id IS NULL OR workspace_id IS NULL
--   UNION ALL SELECT 'image_generation_variants', COUNT(*) FROM image_generation_variants WHERE tenant_id IS NULL OR workspace_id IS NULL;

-- ── 1) Schema additions (nullable — backfills + triggers enforce prod rules) ─────

ALTER TABLE images ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);

ALTER TABLE image_metadata ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE image_metadata ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);

ALTER TABLE image_generation_jobs ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE image_generation_jobs ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);

ALTER TABLE image_generation_variants ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE image_generation_variants ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);

-- ── 2) Backfill images ───────────────────────────────────────────────────────────

-- Prefer canonical tenant → default workspace mapping on tenants.workspace_id
UPDATE images SET workspace_id = (
  SELECT t.workspace_id FROM tenants t WHERE t.id = images.tenant_id LIMIT 1
)
WHERE workspace_id IS NULL
  AND tenant_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM tenants t WHERE t.id = images.tenant_id AND t.workspace_id IS NOT NULL AND t.workspace_id != ''
  );

-- Fallback: pick any workspace row scoped to this tenant (theme resolver uses workspaces.tenant_id)
UPDATE images SET workspace_id = (
  SELECT w.id FROM workspaces w WHERE w.tenant_id = images.tenant_id LIMIT 1
)
WHERE workspace_id IS NULL AND tenant_id IS NOT NULL;

-- Legacy columns on workspaces (older seeds)
UPDATE images SET workspace_id = (
  SELECT w.id FROM workspaces w
  WHERE w.owner_tenant_id = images.tenant_id OR w.default_tenant_id = images.tenant_id
  LIMIT 1
)
WHERE workspace_id IS NULL AND tenant_id IS NOT NULL;

-- Fallback via agentsam_workspace (278 full sync — tenant ↔ ws_* registry)
UPDATE images SET workspace_id = (
  SELECT aw.id FROM agentsam_workspace aw WHERE aw.tenant_id = images.tenant_id LIMIT 1
)
WHERE workspace_id IS NULL AND tenant_id IS NOT NULL;

-- If workspace_id was inferred first but tenant_id was NULL, derive tenant from workspace
UPDATE images SET tenant_id = (
  SELECT aw.tenant_id FROM agentsam_workspace aw WHERE aw.id = images.workspace_id LIMIT 1
)
WHERE tenant_id IS NULL AND workspace_id IS NOT NULL;

UPDATE images SET tenant_id = (
  SELECT w.tenant_id FROM workspaces w WHERE w.id = images.workspace_id AND w.tenant_id IS NOT NULL LIMIT 1
)
WHERE tenant_id IS NULL AND workspace_id IS NOT NULL;

UPDATE images SET tenant_id = (
  SELECT w.owner_tenant_id FROM workspaces w WHERE w.id = images.workspace_id AND w.owner_tenant_id IS NOT NULL LIMIT 1
)
WHERE tenant_id IS NULL AND workspace_id IS NOT NULL;

UPDATE images SET tenant_id = (
  SELECT w.default_tenant_id FROM workspaces w WHERE w.id = images.workspace_id AND w.default_tenant_id IS NOT NULL LIMIT 1
)
WHERE tenant_id IS NULL AND workspace_id IS NOT NULL;

-- ── 3) Backfill image_metadata from parent images ────────────────────────────────

UPDATE image_metadata SET
  tenant_id = (SELECT i.tenant_id FROM images i WHERE i.id = image_metadata.image_id LIMIT 1),
  workspace_id = (SELECT i.workspace_id FROM images i WHERE i.id = image_metadata.image_id LIMIT 1)
WHERE EXISTS (SELECT 1 FROM images i WHERE i.id = image_metadata.image_id);

-- ── 4) Backfill image_generation_jobs ─────────────────────────────────────────────

UPDATE image_generation_jobs SET tenant_id = (
  SELECT aw.tenant_id FROM agentsam_workspace aw WHERE aw.id = image_generation_jobs.workspace_id LIMIT 1
)
WHERE tenant_id IS NULL AND workspace_id IS NOT NULL;

UPDATE image_generation_jobs SET tenant_id = (
  SELECT w.tenant_id FROM workspaces w WHERE w.id = image_generation_jobs.workspace_id AND w.tenant_id IS NOT NULL LIMIT 1
)
WHERE tenant_id IS NULL AND workspace_id IS NOT NULL;

UPDATE image_generation_jobs SET tenant_id = (
  SELECT w.owner_tenant_id FROM workspaces w WHERE w.id = image_generation_jobs.workspace_id AND w.owner_tenant_id IS NOT NULL LIMIT 1
)
WHERE tenant_id IS NULL AND workspace_id IS NOT NULL;

UPDATE image_generation_jobs SET tenant_id = (
  SELECT w.default_tenant_id FROM workspaces w WHERE w.id = image_generation_jobs.workspace_id AND w.default_tenant_id IS NOT NULL LIMIT 1
)
WHERE tenant_id IS NULL AND workspace_id IS NOT NULL;

UPDATE image_generation_jobs SET workspace_id = (
  SELECT t.workspace_id FROM tenants t
  WHERE t.id = image_generation_jobs.tenant_id AND t.workspace_id IS NOT NULL AND trim(t.workspace_id) != ''
  LIMIT 1
)
WHERE workspace_id IS NULL AND tenant_id IS NOT NULL;

UPDATE image_generation_jobs SET workspace_id = (
  SELECT w.id FROM workspaces w WHERE w.tenant_id = image_generation_jobs.tenant_id LIMIT 1
)
WHERE workspace_id IS NULL AND tenant_id IS NOT NULL;

UPDATE image_generation_jobs SET workspace_id = (
  SELECT aw.id FROM agentsam_workspace aw WHERE aw.tenant_id = image_generation_jobs.tenant_id LIMIT 1
)
WHERE workspace_id IS NULL AND tenant_id IS NOT NULL;

UPDATE image_generation_jobs SET workspace_id = (
  SELECT w.id FROM workspaces w
  WHERE w.owner_tenant_id = image_generation_jobs.tenant_id OR w.default_tenant_id = image_generation_jobs.tenant_id
  LIMIT 1
)
WHERE workspace_id IS NULL AND tenant_id IS NOT NULL;

-- Known internal smoke rows only (adjust IDs for your org — avoids poisoning real tenants)
UPDATE image_generation_jobs SET
  tenant_id = 'tenant_sam_primeaux',
  workspace_id = 'ws_inneranimalmedia'
WHERE tenant_id IS NULL
  AND workspace_id IS NULL
  AND session_id IN ('smoke_test');

-- ── 5) Backfill image_generation_variants from jobs ──────────────────────────────

UPDATE image_generation_variants SET
  tenant_id = (SELECT j.tenant_id FROM image_generation_jobs j WHERE j.id = image_generation_variants.job_id LIMIT 1),
  workspace_id = (SELECT j.workspace_id FROM image_generation_jobs j WHERE j.id = image_generation_variants.job_id LIMIT 1)
WHERE job_id IS NOT NULL;

UPDATE image_generation_variants SET
  tenant_id = 'tenant_sam_primeaux',
  workspace_id = 'ws_inneranimalmedia'
WHERE tenant_id IS NULL
  AND workspace_id IS NULL
  AND EXISTS (
    SELECT 1 FROM image_generation_jobs j
    WHERE j.id = image_generation_variants.job_id
      AND j.session_id IN ('smoke_test')
  );

-- ── 6) Indexes (tenant + workspace are the primary dashboard filters) ───────────

CREATE INDEX IF NOT EXISTS idx_images_tenant_workspace ON images(tenant_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_images_workspace_user ON images(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_images_tenant_workspace_r2 ON images(tenant_id, workspace_id, r2_key);

CREATE INDEX IF NOT EXISTS idx_image_metadata_tenant_workspace ON image_metadata(tenant_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_image_generation_jobs_tenant_workspace ON image_generation_jobs(tenant_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_image_generation_jobs_workspace_status ON image_generation_jobs(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_image_generation_variants_tenant_workspace ON image_generation_variants(tenant_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_image_generation_variants_job ON image_generation_variants(job_id);

-- ── 7) Triggers — enforce tenant_id + workspace_id on write (ws_* + tenant_*) ────

DROP TRIGGER IF EXISTS trg_images_ins_tenant_workspace;
CREATE TRIGGER trg_images_ins_tenant_workspace
BEFORE INSERT ON images
FOR EACH ROW
WHEN NEW.tenant_id IS NULL OR NEW.workspace_id IS NULL OR trim(COALESCE(NEW.tenant_id, '')) = '' OR trim(COALESCE(NEW.workspace_id, '')) = ''
BEGIN
  SELECT RAISE(ABORT, 'images requires non-null tenant_id and workspace_id (tenant_* + ws_*)');
END;

DROP TRIGGER IF EXISTS trg_images_upd_tenant_workspace;
CREATE TRIGGER trg_images_upd_tenant_workspace
BEFORE UPDATE ON images
FOR EACH ROW
WHEN NEW.tenant_id IS NULL OR NEW.workspace_id IS NULL OR trim(COALESCE(NEW.tenant_id, '')) = '' OR trim(COALESCE(NEW.workspace_id, '')) = ''
BEGIN
  SELECT RAISE(ABORT, 'images requires non-null tenant_id and workspace_id (tenant_* + ws_*)');
END;

DROP TRIGGER IF EXISTS trg_image_metadata_ins_tenant_workspace;
CREATE TRIGGER trg_image_metadata_ins_tenant_workspace
BEFORE INSERT ON image_metadata
FOR EACH ROW
WHEN NEW.tenant_id IS NULL OR NEW.workspace_id IS NULL OR trim(COALESCE(NEW.tenant_id, '')) = '' OR trim(COALESCE(NEW.workspace_id, '')) = ''
BEGIN
  SELECT RAISE(ABORT, 'image_metadata requires non-null tenant_id and workspace_id');
END;

DROP TRIGGER IF EXISTS trg_image_metadata_upd_tenant_workspace;
CREATE TRIGGER trg_image_metadata_upd_tenant_workspace
BEFORE UPDATE ON image_metadata
FOR EACH ROW
WHEN NEW.tenant_id IS NULL OR NEW.workspace_id IS NULL OR trim(COALESCE(NEW.tenant_id, '')) = '' OR trim(COALESCE(NEW.workspace_id, '')) = ''
BEGIN
  SELECT RAISE(ABORT, 'image_metadata requires non-null tenant_id and workspace_id');
END;

DROP TRIGGER IF EXISTS trg_image_generation_jobs_ins_tenant_workspace;
CREATE TRIGGER trg_image_generation_jobs_ins_tenant_workspace
BEFORE INSERT ON image_generation_jobs
FOR EACH ROW
WHEN NEW.tenant_id IS NULL OR NEW.workspace_id IS NULL OR trim(COALESCE(NEW.tenant_id, '')) = '' OR trim(COALESCE(NEW.workspace_id, '')) = ''
BEGIN
  SELECT RAISE(ABORT, 'image_generation_jobs requires non-null tenant_id and workspace_id');
END;

DROP TRIGGER IF EXISTS trg_image_generation_jobs_upd_tenant_workspace;
CREATE TRIGGER trg_image_generation_jobs_upd_tenant_workspace
BEFORE UPDATE ON image_generation_jobs
FOR EACH ROW
WHEN NEW.tenant_id IS NULL OR NEW.workspace_id IS NULL OR trim(COALESCE(NEW.tenant_id, '')) = '' OR trim(COALESCE(NEW.workspace_id, '')) = ''
BEGIN
  SELECT RAISE(ABORT, 'image_generation_jobs requires non-null tenant_id and workspace_id');
END;

DROP TRIGGER IF EXISTS trg_image_generation_variants_ins_tenant_workspace;
CREATE TRIGGER trg_image_generation_variants_ins_tenant_workspace
BEFORE INSERT ON image_generation_variants
FOR EACH ROW
WHEN NEW.tenant_id IS NULL OR NEW.workspace_id IS NULL OR trim(COALESCE(NEW.tenant_id, '')) = '' OR trim(COALESCE(NEW.workspace_id, '')) = ''
BEGIN
  SELECT RAISE(ABORT, 'image_generation_variants requires non-null tenant_id and workspace_id');
END;

DROP TRIGGER IF EXISTS trg_image_generation_variants_upd_tenant_workspace;
CREATE TRIGGER trg_image_generation_variants_upd_tenant_workspace
BEFORE UPDATE ON image_generation_variants
FOR EACH ROW
WHEN NEW.tenant_id IS NULL OR NEW.workspace_id IS NULL OR trim(COALESCE(NEW.tenant_id, '')) = '' OR trim(COALESCE(NEW.workspace_id, '')) = ''
BEGIN
  SELECT RAISE(ABORT, 'image_generation_variants requires non-null tenant_id and workspace_id');
END;
