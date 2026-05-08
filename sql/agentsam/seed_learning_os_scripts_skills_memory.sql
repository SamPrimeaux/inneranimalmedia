-- Seed: Register Learning OS scripts, skill, and memories for Agent Sam
-- Notes:
-- - Idempotent: uses INSERT OR REPLACE.
-- - Resolves a real admin user_id via CTE (prefers active superadmin in tenant_sam_primeaux).
-- - Intended to be executed via Wrangler D1 against inneranimalmedia-business.

-- -------------------------------------------------------------------
-- agentsam_scripts: Learning OS workflows/scripts registry
-- -------------------------------------------------------------------
INSERT OR REPLACE INTO agentsam_scripts (
  id,
  workspace_id,
  name,
  path,
  description,
  purpose,
  runner,
  requires_env,
  owner_only,
  safe_to_run,
  run_before,
  run_after,
  never_run_with,
  preferred_for,
  notes,
  is_active,
  created_at,
  updated_at
) VALUES (
  'script_learning_os_dashboard_build_vite_only',
  'ws_inneranimalmedia',
  'Build dashboard Vite app',
  'npm run build:vite-only',
  'Builds the dashboard Vite app through the root package script.',
  'build',
  'npm',
  0,
  1,
  1,
  NULL,
  NULL,
  NULL,
  'dashboard frontend validation before R2 upload/deploy',
  'Root package.json does not have npm run build. Use npm run build:vite-only.',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR REPLACE INTO agentsam_scripts (
  id,
  workspace_id,
  name,
  path,
  description,
  purpose,
  runner,
  requires_env,
  owner_only,
  safe_to_run,
  run_before,
  run_after,
  never_run_with,
  preferred_for,
  notes,
  is_active,
  created_at,
  updated_at
) VALUES (
  'script_cf_worker_smart_build_noop',
  'ws_inneranimalmedia',
  'Worker deploy smart-build (noop, skip Vite)',
  'node scripts/smart-build.mjs',
  'Logs and exits without running Vite. Worker bundle pipeline only; dashboard assets deploy to R2 separately.',
  'deploy',
  'node',
  0,
  1,
  1,
  NULL,
  NULL,
  NULL,
  'Cloudflare Workers deploy when src/worker/migrations change (dashboard excluded via CF Build watch paths)',
  'wrangler.production.toml no longer sets [build] command; CF Builds exclusions replace git-diff smart build. Safe doc/manual smoke.',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR REPLACE INTO agentsam_scripts (
  id,
  workspace_id,
  name,
  path,
  description,
  purpose,
  runner,
  requires_env,
  owner_only,
  safe_to_run,
  run_before,
  run_after,
  never_run_with,
  preferred_for,
  notes,
  is_active,
  created_at,
  updated_at
) VALUES (
  'script_learning_os_dashboard_r2_upload_prod',
  'ws_inneranimalmedia',
  'Upload dashboard app bundle to R2',
  'npm run r2:upload:dashboard-app-prod',
  'Uploads built dashboard assets to the production R2 location.',
  'deploy',
  'npm',
  1,
  1,
  1,
  'npm run deploy',
  NULL,
  NULL,
  'publishing dashboard SPA assets after Vite build',
  'Run only after npm run build:vite-only passes.',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR REPLACE INTO agentsam_scripts (
  id,
  workspace_id,
  name,
  path,
  description,
  purpose,
  runner,
  requires_env,
  owner_only,
  safe_to_run,
  run_before,
  run_after,
  never_run_with,
  preferred_for,
  notes,
  is_active,
  created_at,
  updated_at
) VALUES (
  'script_learning_os_worker_deploy',
  'ws_inneranimalmedia',
  'Deploy production Worker',
  'npm run deploy',
  'Deploys the production Cloudflare Worker using the repo deploy script.',
  'deploy',
  'npm',
  1,
  1,
  0,
  NULL,
  'npm run build:vite-only; npm run r2:upload:dashboard-app-prod',
  NULL,
  'final production Worker deployment after dashboard asset upload',
  'Production deploy should require Agent Sam command governance/approval.',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR REPLACE INTO agentsam_scripts (
  id,
  workspace_id,
  name,
  path,
  description,
  purpose,
  runner,
  requires_env,
  owner_only,
  safe_to_run,
  run_before,
  run_after,
  never_run_with,
  preferred_for,
  notes,
  is_active,
  created_at,
  updated_at
) VALUES (
  'script_learning_os_sync_course_to_r2',
  'ws_inneranimalmedia',
  'Sync Learning OS course folder to R2',
  'python3 scripts/sync_learn_course_to_r2.py software-engineering-builder-os',
  'Uploads a local learn/<course-slug> course package to the R2 learn/ prefix.',
  'maintenance',
  'python',
  1,
  1,
  1,
  NULL,
  NULL,
  NULL,
  'syncing course markdown, SQL, manifests, .keep folders, and assets to R2',
  'Supports --dry-run. Verifies representative objects with r2 object get because Wrangler v4 does not support r2 object list in this setup.',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR REPLACE INTO agentsam_scripts (
  id,
  workspace_id,
  name,
  path,
  description,
  purpose,
  runner,
  requires_env,
  owner_only,
  safe_to_run,
  run_before,
  run_after,
  never_run_with,
  preferred_for,
  notes,
  is_active,
  created_at,
  updated_at
) VALUES (
  'script_learning_os_write_area_readme',
  'ws_inneranimalmedia',
  'Write and upload Learning OS R2 README',
  'python3 scripts/write_learn_area_readme.py --upload --verify',
  'Writes learn/README.md and docs/learn/r2-course-library-readme.md, uploads root README to R2, and verifies it.',
  'maintenance',
  'python',
  1,
  1,
  1,
  NULL,
  NULL,
  NULL,
  'keeping the R2 learn/ root self-documented for agents and maintainers',
  'Generated README explains R2 course folder behavior, .keep files, D1 tables, lesson_assets, verification, and buildout plan.',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR REPLACE INTO agentsam_scripts (
  id,
  workspace_id,
  name,
  path,
  description,
  purpose,
  runner,
  requires_env,
  owner_only,
  safe_to_run,
  run_before,
  run_after,
  never_run_with,
  preferred_for,
  notes,
  is_active,
  created_at,
  updated_at
) VALUES (
  'script_learning_os_reconcile_course_apply',
  'ws_inneranimalmedia',
  'Apply Learning OS course reconciliation',
  'python3 scripts/reconcile_learning_os_course.py --apply',
  'Generates and applies schema-aware SQL to reconcile Software Engineering Builder OS with courses, course_modules, course_lessons, lessons, and lesson_assets.',
  'maintenance',
  'python',
  1,
  1,
  1,
  NULL,
  NULL,
  NULL,
  'repairing/aligning Learn data without assuming missing columns',
  'Introspects D1 schema before generating SQL. Prevents failures such as selecting courses.is_published when that column does not exist.',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

INSERT OR REPLACE INTO agentsam_scripts (
  id,
  workspace_id,
  name,
  path,
  description,
  purpose,
  runner,
  requires_env,
  owner_only,
  safe_to_run,
  run_before,
  run_after,
  never_run_with,
  preferred_for,
  notes,
  is_active,
  created_at,
  updated_at
) VALUES (
  'script_learning_os_reconcile_course_verify',
  'ws_inneranimalmedia',
  'Verify Learning OS course reconciliation',
  'python3 scripts/reconcile_learning_os_course.py --verify',
  'Runs schema-safe verification checks for Software Engineering Builder OS course, modules, lessons, and assets.',
  'audit',
  'python',
  1,
  1,
  1,
  NULL,
  NULL,
  NULL,
  'confirming Learning OS D1/R2 data before UI/deploy work',
  'Run after applying lessons/assets/reconciliation SQL.',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

-- -------------------------------------------------------------------
-- agentsam_skill: Learning OS Operator
-- -------------------------------------------------------------------
WITH
  admin_user_candidates AS (
    SELECT
      u.id AS user_id,
      u.created_at AS created_at,
      CASE
        WHEN u.is_superadmin = 1 THEN
          CASE
            WHEN u.email LIKE '%@inneranimalmedia.com' THEN 0
            WHEN u.email LIKE '%@inneranimals.com' THEN 1
            ELSE 2
          END
        ELSE 10
      END AS rank
    FROM auth_users u
    WHERE u.status = 'active'
      AND u.tenant_id = 'tenant_sam_primeaux'
  ),
  admin_user AS (
    SELECT c.user_id
    FROM admin_user_candidates c
    ORDER BY c.rank ASC, c.created_at DESC
    LIMIT 1
  )
INSERT OR REPLACE INTO agentsam_skill (
  id,
  user_id,
  name,
  description,
  file_path,
  scope,
  workspace_id,
  content_markdown,
  metadata_json,
  is_active,
  created_at,
  updated_at,
  icon,
  access_mode,
  sort_order,
  slash_trigger,
  globs,
  always_apply,
  version,
  tags,
  tenant_id
)
SELECT
  'skill_learning_os_operator',
  (SELECT user_id FROM admin_user LIMIT 1),
  'Learning OS Operator',
  'Operate and maintain the R2/D1-backed Learning OS course system, including course folders, lessons, lesson_assets, R2 syncs, D1 reconciliation, and /dashboard/learn validation.',
  'docs/learn/r2-course-library-readme.md',
  'workspace',
  'ws_inneranimalmedia',
  '# Learning OS Operator

## Read this first
- Start with `learn/README.md` to understand folder contracts and what belongs in-repo vs in R2.

## Course editing rules
- Treat `learn/<course-slug>/manifest.json` as the contract of record for a course before editing structure or metadata.
- Do not edit course structure by guessing table columns; prefer the course SQL under `sql/learn/` and schema-aware scripts.

## Upload/sync workflow (R2)
- Upload a course folder with:
  - `python3 scripts/sync_learn_course_to_r2.py <course-slug>`
- Prefer `--dry-run` when unsure.
- Verify R2 objects with `wrangler r2 object get` (this setup does not rely on `wrangler r2 object list`).

## Seeding structured lesson data (D1)
- Seed lessons and `lesson_assets` from course SQL under `sql/learn/` (course packages should carry their own seed SQL).

## Schema-safe reconciliation (D1)
- Use:
  - `python3 scripts/reconcile_learning_os_course.py --apply`
  - `python3 scripts/reconcile_learning_os_course.py --verify`
- Do not assume `courses.is_published` or `course_modules.is_published` exists. Always introspect schema first and generate compatible SQL.

## UI/agent integration constraints
- Do not create fake Learn terminal/editor/browser panels. Learn should reuse the existing Agent workspace tool panels and dispatch mechanisms.',
  json_object(
    'area', 'learning_os',
    'course_slug', 'software-engineering-builder-os',
    'r2_prefix', 'learn/',
    'docs', json_array(
      'learn/README.md',
      'docs/learn/r2-course-library-readme.md',
      'docs/learn/LEARNING_OS_RECONCILIATION.md'
    ),
    'scripts', json_array(
      'scripts/sync_learn_course_to_r2.py',
      'scripts/write_learn_area_readme.py',
      'scripts/reconcile_learning_os_course.py'
    )
  ),
  1,
  datetime('now'),
  datetime('now'),
  'book-open',
  'read_write',
  25,
  '/learning-os',
  'learn/**,docs/learn/**,sql/learn/**,dashboard/components/learn/**,src/api/learn.js,scripts/*learn*',
  0,
  1,
  '[\"learning_os\",\"r2\",\"d1\",\"lessons\",\"courseware\",\"dashboard_learn\"]',
  'tenant_sam_primeaux';

-- -------------------------------------------------------------------
-- agentsam_memory: Learning OS project/decision memories (unique by tenant_id + user_id + key)
-- -------------------------------------------------------------------
WITH
  admin_user_candidates AS (
    SELECT
      u.id AS user_id,
      u.created_at AS created_at,
      CASE
        WHEN u.is_superadmin = 1 THEN
          CASE
            WHEN u.email LIKE '%@inneranimalmedia.com' THEN 0
            WHEN u.email LIKE '%@inneranimals.com' THEN 1
            ELSE 2
          END
        ELSE 10
      END AS rank
    FROM auth_users u
    WHERE u.status = 'active'
      AND u.tenant_id = 'tenant_sam_primeaux'
  ),
  admin_user AS (
    SELECT c.user_id
    FROM admin_user_candidates c
    ORDER BY c.rank ASC, c.created_at DESC
    LIMIT 1
  )
INSERT OR REPLACE INTO agentsam_memory (
  tenant_id,
  user_id,
  workspace_id,
  memory_type,
  key,
  value,
  source,
  tags,
  created_at,
  updated_at
)
SELECT
  'tenant_sam_primeaux',
  (SELECT user_id FROM admin_user LIMIT 1),
  'ws_inneranimalmedia',
  'decision',
  'learning_os_r2_root_contract',
  'The Learning OS course library uses repo learn/<course-slug>/ as source, R2 learn/<course-slug>/ as public course assets, and D1 lessons/lesson_assets as structured metadata. R2 folders are prefixes; .keep files preserve intentional empty folders.',
  'sql/agentsam/seed_learning_os_scripts_skills_memory.sql',
  '[\"learning_os\",\"r2\",\"course_contract\"]',
  unixepoch(),
  unixepoch()
UNION ALL
SELECT
  'tenant_sam_primeaux',
  (SELECT user_id FROM admin_user LIMIT 1),
  'ws_inneranimalmedia',
  'project',
  'learning_os_sebo_course_live',
  'Software Engineering Builder OS is live as a reusable multi-user course with 10 published lessons and 10 lesson_markdown assets. Content is R2-backed under learn/software-engineering-builder-os/.',
  'sql/agentsam/seed_learning_os_scripts_skills_memory.sql',
  '[\"learning_os\",\"software_engineering_builder_os\",\"lessons\"]',
  unixepoch(),
  unixepoch()
UNION ALL
SELECT
  'tenant_sam_primeaux',
  (SELECT user_id FROM admin_user LIMIT 1),
  'ws_inneranimalmedia',
  'decision',
  'learning_os_validation_build_command',
  'The correct dashboard build validation command is npm run build:vite-only, not npm run build. Root package.json lacks build; build:vite-only runs npm --prefix dashboard run build.',
  'sql/agentsam/seed_learning_os_scripts_skills_memory.sql',
  '[\"learning_os\",\"dashboard\",\"build\"]',
  unixepoch(),
  unixepoch()
UNION ALL
SELECT
  'tenant_sam_primeaux',
  (SELECT user_id FROM admin_user LIMIT 1),
  'ws_inneranimalmedia',
  'decision',
  'learning_os_schema_safety_rule',
  'Learn API and D1 verification must not assume courses.is_published or course_modules.is_published exist. Use schema introspection and prefer canonical lessons + lesson_assets, with course_lessons only as compatibility fallback.',
  'sql/agentsam/seed_learning_os_scripts_skills_memory.sql',
  '[\"learning_os\",\"d1\",\"schema_safety\"]',
  unixepoch(),
  unixepoch()
UNION ALL
SELECT
  'tenant_sam_primeaux',
  (SELECT user_id FROM admin_user LIMIT 1),
  'ws_inneranimalmedia',
  'project',
  'learning_os_ui_remaster_commit',
  '/dashboard/learn was remastered in commit 90d374d as a 2-panel Learning OS workspace with compact left rail, dominant main workspace, Resources drawer, lesson tabs, lesson_assets rendering, R2 markdown loading, and Agent Sam context dispatch through iam-agent-external-send.',
  'sql/agentsam/seed_learning_os_scripts_skills_memory.sql',
  '[\"learning_os\",\"ui\",\"commit_90d374d\"]',
  unixepoch(),
  unixepoch();

