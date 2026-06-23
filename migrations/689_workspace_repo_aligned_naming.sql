-- 689: Align workspace labels with repo/worker names (inneranimalmedia, fuelnfreetime).
-- Fix fuel incorrectly appearing as tenant default / "main" app.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/689_workspace_repo_aligned_naming.sql

PRAGMA foreign_keys = OFF;

-- Platform IAM worker/repo — not "IAM Main SaaS"
UPDATE agentsam_workspace
SET
  name = 'inneranimalmedia',
  display_name = 'inneranimalmedia',
  workspace_slug = 'inneranimalmedia',
  worker_name = COALESCE(NULLIF(TRIM(worker_name), ''), 'inneranimalmedia'),
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.workspace_kind', 'platform',
    '$.label', 'SamPrimeaux/inneranimalmedia Worker'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE workspaces
SET
  name = 'inneranimalmedia',
  display_name = 'inneranimalmedia',
  slug = 'inneranimalmedia',
  status = 'active',
  brand = NULL,
  category = 'platform',
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

-- Fuel collab workspace — worker/repo name, never tenant default
UPDATE agentsam_workspace
SET
  name = 'fuelnfreetime',
  display_name = 'fuelnfreetime',
  workspace_slug = COALESCE(NULLIF(TRIM(workspace_slug), ''), 'fuelnfreetime'),
  worker_name = COALESCE(NULLIF(TRIM(worker_name), ''), 'fuelnfreetime'),
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.workspace_kind', 'client_saas',
    '$.label', 'SamPrimeaux/fuelnfreetime'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';

UPDATE workspaces
SET
  name = 'fuelnfreetime',
  display_name = 'fuelnfreetime',
  slug = 'fuelnfreetime',
  status = 'active',
  brand = NULL,
  category = 'client',
  updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';

-- Tenant default = platform IAM workspace only
UPDATE tenant_workspaces
SET is_default = 0, updated_at = unixepoch()
WHERE tenant_id = 'tenant_sam_primeaux'
  AND workspace_id = 'ws_fuelnfreetime';

UPDATE tenant_workspaces
SET is_default = 1, is_active = 1, updated_at = unixepoch()
WHERE tenant_id = 'tenant_sam_primeaux'
  AND workspace_id = 'ws_inneranimalmedia';

INSERT OR IGNORE INTO tenant_workspaces (
  id, tenant_id, workspace_id, role, is_default, is_active, created_at, updated_at
) VALUES (
  'tw_sam_inneranimalmedia',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'owner',
  1,
  1,
  unixepoch(),
  unixepoch()
);

PRAGMA foreign_keys = ON;
