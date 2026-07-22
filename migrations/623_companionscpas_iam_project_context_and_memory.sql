-- 623: IAM platform view of CompanionsCPAS client project + Stripe Elements donation memory.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/623_companionscpas_iam_project_context_and_memory.sql

INSERT OR REPLACE INTO agentsam_project_context (
  id, tenant_id, workspace_id, project_key, project_name, project_type, status, priority,
  description, goals, constraints, current_blockers, primary_tables, secondary_tables,
  workers_involved, r2_buckets_involved, domains_involved, key_files, related_routes,
  linked_plan_id, notes, started_at, created_at, updated_at
) VALUES (
  'ctx_companionscpas', 'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'companionscpas', 'Companions of CPAS — nonprofit client worker', 'client_worker', 'active', 90,
  'Client Worker companionscpas (companionsofcaddo.org). D1 fd6dd6fb. R2 companionscpas. Stripe Elements on /donate (commit b591b34). Smoke needed: donation_intents=2, donations=0.',
  '["Complete $1 Stripe Elements donation smoke","Enable worker observability"]',
  '["Client repo/worker separate from IAM","Do not hardcode tenant/workspace ids"]',
  '["No completed donations or stripe_webhooks rows yet (2026-06-12)"]',
  '["cms_pages","cms_publish_jobs","donation_intents","donations","stripe_webhooks"]',
  '["donation_payments","donors","donation_settings"]',
  'companionscpas', 'companionscpas', 'companionsofcaddo.org',
  '["/static/js/donate-modal.js","src/index.js"]',
  '["/","/about","/adopt","/donate","POST /api/donations/checkout","POST /api/webhooks/stripe"]',
  NULL,
  'IAM canonical client context (623). Archive ctx_f72a887a8da9b004.',
  unixepoch(), unixepoch(), unixepoch()
);

UPDATE agentsam_project_context
SET status = 'archived', priority = 0,
    notes = COALESCE(notes, '') || ' | Archived 623 — superseded by ctx_companionscpas.',
    updated_at = unixepoch()
WHERE id = 'ctx_f72a887a8da9b004' AND id != 'ctx_companionscpas';

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_companionscpas_stripe_elements_donation_live_2026_06',
  'tenant_sam_primeaux', 'au_871d920d1233cbd1', 'ws_inneranimalmedia',
  'state', 'companionscpas_stripe_elements_donation_live_2026_06',
  'CompanionsCPAS Stripe Elements in-modal donation flow is live on companionsofcaddo.org (Jun 2026). Deploy: git b591b34, worker 446c6431. D1 audit: donation_intents=2, donations=0 — pending $1 smoke.',
  'CompanionsCPAS Stripe Elements donation — live Jun 2026',
  'Elements in-modal on /donate; webhook we_1ThIx5RGnRsvqnfiDsw6zLfE; D1 donations/webhooks rows zero — run smoke.',
  'project_brief_20260612',
  '["companionscpas","donations","stripe","elements","webhook","production","jun2026"]',
  1.0, 9, 1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:companionscpas_stripe_elements_donation_live_2026_06',
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  value = excluded.value, title = excluded.title, summary = excluded.summary,
  workspace_id = excluded.workspace_id, memory_type = excluded.memory_type,
  source = excluded.source, tags = excluded.tags, importance = excluded.importance,
  is_pinned = excluded.is_pinned, sync_key = excluded.sync_key, updated_at = unixepoch();
