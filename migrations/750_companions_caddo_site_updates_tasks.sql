-- 750: Companions of Caddo client — site updates project spine + linked collaborate tasks.
-- Source: Lori + Michelle feedback (Jul 2026). Site: companionsofcaddo.org
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/750_companions_caddo_site_updates_tasks.sql

UPDATE projects
SET
  name = 'Companions of Caddo — Site Updates',
  client_name = 'Companions of Caddo',
  description = 'Lori + Michelle feedback site updates for companionsofcaddo.org. Status: in progress.',
  domain = 'companionsofcaddo.org',
  worker_id = 'companionscpas',
  status = 'development',
  priority = 85,
  tags_json = '["client","companionscpas","site-updates","companionsofcaddo"]',
  metadata_json = json_patch(
    COALESCE(metadata_json, '{}'),
    '{"brief_source":"Lori + Michelle feedback","brief_status":"in_progress","site":"companionsofcaddo.org"}'
  ),
  updated_at = datetime('now')
WHERE id = 'proj_mqaxampl_ri9bkq';

-- Collaborate tasks (agentsam_todo) — idempotent by primary key
INSERT OR IGNORE INTO agentsam_todo (
  id, tenant_id, workspace_id, title, description, status, priority, category, tags,
  linked_route, notes, created_by, sort_order, task_type, execution_status,
  project_id, project_key, created_at, updated_at
) VALUES
(
  'todo_cpas_site_logo_homepage',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Logo on homepage',
  'Add the Companions logo prominently to the home page header/hero area.',
  'open', 'high', 'CPAS · Design', '["companionscpas","design","site-updates"]',
  'https://companionsofcaddo.org/', 'Open question: confirm current logo file is correct/up-to-date (Lori).',
  'sam_primeaux', 10, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_site_admin_login_relocate',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Relocate admin login link',
  'Move the logo-click admin dashboard login off the main nav. Use a small inconspicuous control (footer or /admin route). General public should never see this.',
  'open', 'high', 'CPAS · Design', '["companionscpas","design","auth","site-updates"]',
  'https://companionsofcaddo.org/', NULL,
  'sam_primeaux', 20, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_site_color_scheme',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Color scheme overhaul',
  'Replace black background with warmer/cheerful palette. Client suggested grey; pull colors from logo. Provide 2–3 mockup options for review.',
  'open', 'high', 'CPAS · Design', '["companionscpas","design","branding","site-updates"]',
  'https://companionsofcaddo.org/', NULL,
  'sam_primeaux', 30, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_site_contact_us',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Add Contact Us section',
  'Add Contact Us tab/section with email contact form and Facebook Messenger link.',
  'open', 'high', 'CPAS · Navigation', '["companionscpas","navigation","contact","site-updates"]',
  'https://companionsofcaddo.org/', NULL,
  'sam_primeaux', 40, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_site_mission_statement',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Add mission statement',
  'Add mission statement to site. Pending: need official mission statement copy from client.',
  'open', 'medium', 'CPAS · Navigation', '["companionscpas","navigation","content","awaiting-client","site-updates"]',
  'https://companionsofcaddo.org/', 'Awaiting mission statement text from Lori/Michelle.',
  'sam_primeaux', 50, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_site_social_links',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Add social media links',
  'Add social media links — Facebook at minimum. Ask client for full list of handles/URLs.',
  'open', 'medium', 'CPAS · Navigation', '["companionscpas","navigation","social","site-updates"]',
  'https://companionsofcaddo.org/', NULL,
  'sam_primeaux', 60, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_site_remove_chopper_foster',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Remove Chopper foster listing',
  'Remove "Chopper needs a foster home" — Chopper has been placed.',
  'open', 'high', 'CPAS · Community', '["companionscpas","community","foster","site-updates"]',
  'https://companionsofcaddo.org/community', NULL,
  'sam_primeaux', 70, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_site_remove_foster_dogs_section',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Remove foster dogs section',
  'Remove "Dogs that need a foster right now" section entirely — too dynamic to maintain; client prefers it gone.',
  'open', 'high', 'CPAS · Community', '["companionscpas","community","foster","site-updates"]',
  'https://companionsofcaddo.org/community', NULL,
  'sam_primeaux', 80, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_site_remove_transport_driver',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Remove Transport Driver listing',
  'Remove Transport Driver volunteer listing from community/foster area.',
  'open', 'medium', 'CPAS · Community', '["companionscpas","community","site-updates"]',
  'https://companionsofcaddo.org/community', NULL,
  'sam_primeaux', 90, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_site_remove_foster_coordinator',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Remove Foster Coordinator listing',
  'Remove Foster Coordinator volunteer listing from community/foster area.',
  'open', 'medium', 'CPAS · Community', '["companionscpas","community","site-updates"]',
  'https://companionsofcaddo.org/community', NULL,
  'sam_primeaux', 100, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_site_foster_apps_to_email',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Replace foster applications with Amanda email',
  'Remove all foster application forms. Replace with link/instructions to email Amanda Norris at anorris@caddo.gov — she sends the official Caddo application.',
  'open', 'high', 'CPAS · Community', '["companionscpas","community","foster","site-updates"]',
  'https://companionsofcaddo.org/community', 'Contact: anorris@caddo.gov',
  'sam_primeaux', 110, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_site_stripe_passkey_reset',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Follow up on Stripe passkey reset',
  'Lori/board needs to reset Stripe passkey. If blocked, escalate to Stripe support or investigate admin-side options.',
  'open', 'high', 'CPAS · Stripe', '["companionscpas","stripe","payments","site-updates"]',
  'https://companionsofcaddo.org/donate', NULL,
  'sam_primeaux', 120, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_oq_logo_final',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Open Q: Is header logo the final logo?',
  'Ask Lori: Is the current logo in the header the correct/final logo?',
  'open', 'low', 'CPAS · Open Questions', '["companionscpas","open-question","awaiting-client","site-updates"]',
  NULL, 'Owner: Lori',
  'sam_primeaux', 200, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_oq_mission_copy',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Open Q: Official mission statement text?',
  'Ask Lori/Michelle: What is the official mission statement text?',
  'open', 'low', 'CPAS · Open Questions', '["companionscpas","open-question","awaiting-client","site-updates"]',
  NULL, 'Owner: Lori/Michelle',
  'sam_primeaux', 210, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_oq_social_handles',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Open Q: Social media platforms/handles?',
  'Ask Lori/Michelle: What social media platforms and handles/URLs should be linked?',
  'open', 'low', 'CPAS · Open Questions', '["companionscpas","open-question","awaiting-client","site-updates"]',
  NULL, 'Owner: Lori/Michelle',
  'sam_primeaux', 220, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
),
(
  'todo_cpas_oq_stripe_passkey_status',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'Open Q: Stripe passkey reset status?',
  'Ask Lori: Was anyone able to reset the Stripe passkey?',
  'open', 'low', 'CPAS · Open Questions', '["companionscpas","open-question","awaiting-client","stripe","site-updates"]',
  NULL, 'Owner: Lori',
  'sam_primeaux', 230, 'execute', 'queued',
  'proj_mqaxampl_ri9bkq', 'companionscpas', datetime('now'), datetime('now')
);
