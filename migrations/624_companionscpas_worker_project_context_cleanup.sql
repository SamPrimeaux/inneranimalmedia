-- 624: CompanionsCPAS worker D1 — archive duplicate agentsam_project_context rows.
-- Keep canonical master (ctx_companionscpas_cms_publish_v1) + donation session (ctx_cpas_donation_modal_session).
-- Apply to CLIENT D1 (not inneranimalmedia-business):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute companionscpas \
--     --remote --file=./migrations/624_companionscpas_worker_project_context_cleanup.sql

UPDATE agentsam_project_context
SET status = 'archived',
    priority = 0,
    notes = COALESCE(notes, '') || ' | Archived 624 — duplicate/noisy context; use ctx_companionscpas_cms_publish_v1.',
    updated_at = unixepoch()
WHERE id IN (
  'ctx_companionscpas_nonprofit_os',
  'ctx_cpas_master_v1',
  'ctx_030a3256fce8a16a',
  'ctx_companionscpas_platform',
  'ctx_primetech_cpas_001'
)
  AND status = 'active';

UPDATE agentsam_project_context
SET project_key = 'companionscpas',
    project_name = 'CompanionsCPAS — CMS + nonprofit OS (canonical master)',
    priority = 100,
    notes = COALESCE(notes, '') || ' | Canonical master context (624).',
    updated_at = unixepoch()
WHERE id = 'ctx_companionscpas_cms_publish_v1';

UPDATE agentsam_project_context
SET notes = COALESCE(notes, '') || ' | Donation modal session context — merge into master when stable.',
    updated_at = unixepoch()
WHERE id = 'ctx_cpas_donation_modal_session'
  AND status = 'active';
