-- 782: Sync Companions collaborate todos (Jul 6 PM ship) + attach status doc metadata.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/782_companions_todo_sync_status_file.sql
-- R2 object (run after migration):
--   node scripts/publish-companions-status-project-file.mjs

-- ── Completed ────────────────────────────────────────────────────────────────
UPDATE agentsam_todo SET
  status = 'completed',
  notes = 'Shipped Jul 6 PM: /contact live with plum-glass theme, split 16:9 hero, social CTAs, unified Resend pipeline (contact_requests_v2). Git companionscpas 6355e1d.',
  updated_at = datetime('now')
WHERE id = 'todo_cpas_site_contact_us';

UPDATE agentsam_todo SET
  status = 'completed',
  notes = 'Superseded Jul 6 PM: header is dynamic via render_site_nav.js on all public routes — not static cpas-header.html R2 upload. Global plum-glass header live.',
  updated_at = datetime('now')
WHERE project_id = 'proj_companions_cpas_web'
  AND (
    title LIKE '%cpas-header%'
    OR title LIKE '%Community nav fix%'
    OR title LIKE '%Upload cpas-header%'
  );

-- ── In progress (shipped prototype, awaiting client sign-off) ───────────────
UPDATE agentsam_todo SET
  status = 'in_progress',
  notes = 'Jul 6 PM: Logo 2× in plum-glass header (CFI avatar). Awaiting Lori confirmation of final logo asset. See PROJECT_STATUS_2026-07-06.md.',
  updated_at = datetime('now')
WHERE id = 'todo_cpas_site_logo_homepage';

UPDATE agentsam_todo SET
  status = 'in_progress',
  notes = 'Jul 6 PM: Plum-glass theme prototype live site-wide (theme-plum_glass). Client review pending. Revert-safe via --tg-* tokens.',
  updated_at = datetime('now')
WHERE id = 'todo_cpas_site_color_scheme';

UPDATE agentsam_todo SET
  status = 'in_progress',
  notes = 'Jul 6 PM: Footer admin login link (small opacity). Review whether further concealment needed.',
  updated_at = datetime('now')
WHERE id = 'todo_cpas_site_admin_login_relocate';

UPDATE agentsam_todo SET
  status = 'in_progress',
  notes = 'Jul 6 PM: Facebook + Instagram on /contact hero CTAs and footer. Full handle list still TBD from client.',
  updated_at = datetime('now')
WHERE id = 'todo_cpas_site_social_links';

-- ── Attach status doc: memory pointer (Files tab = metadata_json via publish script) ──

INSERT INTO project_memory (
  id, project_id, tenant_id, memory_type, key, value,
  importance_score, confidence_score, created_by, created_at, updated_at
) VALUES (
  'pmem_proj_companions_cpas_web_status_doc_20260706',
  'proj_companions_cpas_web',
  'tenant_sam_primeaux',
  'goal_context',
  'status_doc_2026_07_06',
  'Jul 6 2026 end-of-day status: docs/clients/companionscpas/PROJECT_STATUS_2026-07-06.md + project Files tab PROJECT_STATUS_2026-07-06.md. Companions git 6355e1d. Redesign session ~5:16–7:21 PM CDT.',
  0.95,
  1.0,
  'migration_782',
  unixepoch(),
  unixepoch()
)
ON CONFLICT(project_id, memory_type, key) DO UPDATE SET
  value = excluded.value,
  updated_at = unixepoch();
