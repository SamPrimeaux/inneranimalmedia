-- 500: Quality report public routes + D1 registry (skill MD on R2 autorag, reports on R2 inneranimalmedia)
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/500_agentsam_quality_reports_route_skill.sql
-- Then upload skill MD (not into D1):
--   npm run skills:quality-report:upload-r2

CREATE TABLE IF NOT EXISTS agentsam_quality_reports (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  tenant_id TEXT,
  workspace_id TEXT,
  user_id TEXT,
  report_date TEXT NOT NULL,
  report_time TEXT NOT NULL,
  r2_bucket TEXT NOT NULL DEFAULT 'inneranimalmedia',
  r2_prefix TEXT NOT NULL,
  public_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'quality-report',
  uploaded_files INTEGER NOT NULL DEFAULT 0,
  scope TEXT NOT NULL DEFAULT 'workspace'
    CHECK (scope IN ('platform', 'workspace', 'user')),
  is_public INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_quality_reports_date
  ON agentsam_quality_reports(report_date, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_quality_reports_workspace_date
  ON agentsam_quality_reports(workspace_id, report_date, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agentsam_quality_reports_r2_prefix
  ON agentsam_quality_reports(r2_bucket, r2_prefix);

-- D1: registry row only. Full SKILL.md → inneranimalmedia-autorag/skills/iam-playwright-quality-report/SKILL.md
INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_iam_playwright_quality_report',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'Playwright quality report (IAM branded)',
  'Run Playwright, render IAM-branded HTML, upload report assets to R2, register public /qualityreport/{date}/{time}/ URL.',
  '',
  'skills/iam-playwright-quality-report/SKILL.md',
  'workspace',
  'quality-report',
  '["reports/template/**","tests/e2e/**","playwright*.config.ts","scripts/upload-playwright-report-to-r2.sh","scripts/stage-quality-report-for-upload.sh"]',
  0,
  '["qa","playwright","quality","e2e","browser"]',
  '["/qualityreport","/api/quality-reports/register"]',
  NULL,
  '{}',
  'read_write',
  'clipboard-check',
  '["playwright","quality","e2e","reports"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/iam-playwright-quality-report/SKILL.md","r2_report_bucket":"inneranimalmedia","r2_report_prefix":"reports/quality-report","public_url_pattern":"https://inneranimalmedia.com/qualityreport/{date}/{time}/"}',
  120,
  1,
  'r2',
  1,
  24,
  datetime('now'),
  datetime('now')
);

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, session_id, source, confidence
) VALUES (
  'mem_schema_iam_playwright_quality_report',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'project',
  'schema_iam_playwright_quality_report',
  '{"skill_id":"skill_iam_playwright_quality_report","skill_r2":"inneranimalmedia-autorag/skills/iam-playwright-quality-report/SKILL.md","skill_d1":"agentsam_skill registry only","public_route":"/qualityreport/{date}/{time}/","report_r2":"inneranimalmedia/reports/quality-report/","table":"agentsam_quality_reports"}',
  'session_registry',
  'migration_500',
  1.0
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  updated_at = unixepoch();
