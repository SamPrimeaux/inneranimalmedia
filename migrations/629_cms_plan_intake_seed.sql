-- 629: CMS plan intake anchor — documents CMS-specific intake question bank (runtime in agentsam-plan-intake.js).
-- Goals tagged [CMS · {slug}] trigger cmsPlanIntakeSeedQuestions before insertPlanIntakeBatch row #1.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/629_cms_plan_intake_seed.sql

INSERT OR REPLACE INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, updated_at
)
SELECT
  'mem_cms_plan_intake_seed_v1',
  'tenant_sam_primeaux',
  NULL,
  'ws_inneranimalmedia',
  'policy',
  'cms_plan_intake_seed',
  'CMS studio plan mode uses agentsam_plan_intake_batches phase=pre_plan. Questions (629): (1) template vs scratch vs R2 import, (2) homepage route, (3) theme slug. Metadata optional_details stores project_slug, page_id, bootstrap_cache_key, collab_room. linked_plan_id on agentsam_project_context updated on plan_created.',
  'CMS plan intake question bank',
  'Template/scratch, homepage route, theme slug — wired to plan-controller + intake batch #1.',
  'migration_629',
  '["cms","plan_intake","SESSION_CACHE","IAM_COLLAB"]',
  0.95,
  80,
  1,
  unixepoch()
WHERE EXISTS (SELECT 1 FROM cms_pages LIMIT 1);
