-- 779: Map AGENTSAM.md SSOT for companionscpas + fuelnfreetime in agentsam_project_context.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/779_agentsam_md_client_map.sql

PRAGMA foreign_keys = OFF;

-- ── Companions: ctx on ws_companionscpas + IAM CMS hub ─────────────────────
UPDATE agentsam_project_context
SET
  key_files = '["docs/clients/companionscpas/AGENTSAM.md","docs/clients/companionscpas/project-brief.md","companionscpas/ARCHITECTURE.md","companionscpas/src/index.js","companionscpas/src/api/cms_api.js","companionscpas/src/api/payments_email.js","companionscpas/public/static/js/donate-modal.js"]',
  notes = COALESCE(notes, '') || ' | AGENTSAM.md SSOT mapped 779 (docs/clients/companionscpas/AGENTSAM.md).',
  updated_at = unixepoch()
WHERE id = 'ctx_companionscpas';

UPDATE agentsam_project_context
SET
  description = 'Client worker CMS hub — companionsofcaddo.org. AGENTSAM.md: docs/clients/companionscpas/AGENTSAM.md',
  notes = '{"hub_launcher":true,"target_workspace_id":"ws_companionscpas","cms_hosting":"client_worker","agentsam_md":"docs/clients/companionscpas/AGENTSAM.md"}',
  updated_at = unixepoch()
WHERE id = 'ctx_cms_hub_companionscpas';

-- ── Fuel: ctx on ws_fuelnfreetime + IAM CMS hub ────────────────────────────
UPDATE agentsam_project_context
SET
  key_files = '["docs/clients/fuelnfreetime/AGENTSAM.md","docs/clients/fuelnfreetime/project-brief.md","fuelnfreetime/AGENTS.md","fuelnfreetime/docs/RUNTIME-CONTRACTS-COMMERCE.md","fuelnfreetime/docs/RUNTIME-CONTRACTS-STRIPE.md","fuelnfreetime/src/index.js","fuelnfreetime/src/cms/api.js"]',
  client_id = 'client_fuelnfreetime',
  notes = COALESCE(notes, '') || ' | AGENTSAM.md SSOT mapped 779 (docs/clients/fuelnfreetime/AGENTSAM.md).',
  updated_at = unixepoch()
WHERE id = 'ctx_fuelnfreetime';

UPDATE agentsam_project_context
SET
  description = 'Client worker CMS hub — fuelnfreetime.com. AGENTSAM.md: docs/clients/fuelnfreetime/AGENTSAM.md',
  notes = '{"hub_launcher":true,"target_workspace_id":"ws_fuelnfreetime","cms_hosting":"client_worker","agentsam_md":"docs/clients/fuelnfreetime/AGENTSAM.md"}',
  updated_at = unixepoch()
WHERE id = 'ctx_cms_hub_fuelnfreetime';

PRAGMA foreign_keys = ON;
