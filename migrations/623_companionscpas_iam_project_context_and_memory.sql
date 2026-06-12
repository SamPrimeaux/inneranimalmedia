-- 623: IAM platform view of CompanionsCPAS client project + Stripe Elements donation memory.
-- Reactivate canonical ctx_companionscpas on ws_inneranimalmedia (priority 90).
-- Archive legacy ctx_f72a887a8da9b004 row (stale May blockers).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/623_companionscpas_iam_project_context_and_memory.sql

INSERT OR REPLACE INTO agentsam_project_context (
  id,
  tenant_id,
  workspace_id,
  project_key,
  project_name,
  project_type,
  status,
  priority,
  description,
  goals,
  constraints,
  current_blockers,
  primary_tables,
  secondary_tables,
  workers_involved,
  r2_buckets_involved,
  domains_involved,
  key_files,
  related_routes,
  linked_plan_id,
  notes,
  started_at,
  created_at,
  updated_at
) VALUES (
  'ctx_companionscpas',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'companionscpas',
  'Companions of CPAS — nonprofit client worker',
  'client_worker',
  'active',
  90,
  'Client Worker `companionscpas` (companionsofcaddo.org). D1 database companionscpas (fd6dd6fb). R2 bucket companionscpas; public assets prefer assets.companionsofcaddo.org. CMS: 6 published routes (/, /about, /adopt, /community, /donate, /services); 25 publish jobs done (2026-06-12). Animals 19, fosters 4. Donations: Stripe Elements in-modal on /donate (commit b591b34, worker 446c6431); webhook we_1ThIx5RGnRsvqnfiDsw6zLfE → POST /api/webhooks/stripe. D1 gap: donation_intents=2, donations=0, stripe_webhooks=0 — run $1 Elements smoke. IAM brief: docs/clients/companionscpas/project-brief.md (ingested AGENTSAM_VECTORIZE_DOCUMENTS, lane client_project_semantic_search).',
  '["Complete $1 Stripe Elements donation smoke (webhook + donations rows)","Enable worker observability before debug sessions","Verify Meta plaintext secrets non-empty","Close cms_publish_artifacts tracking gap"]',
  '["Client repo/worker separate from IAM; CPAS D1 is source for runtime CMS/donations","Public shell: /static/global/shared.css + shared.js on every route","Do not hardcode tenant/workspace ids in client worker hot paths"]',
  '["No completed donations or stripe_webhooks rows yet (2026-06-12)","Worker observability disabled","cms_publish_artifacts empty despite successful publish jobs"]',
  '["cms_pages","cms_publish_jobs","donation_intents","donations","stripe_webhooks","fundraising_campaigns","animal_profiles"]',
  '["donation_payments","donors","donation_settings","cpas_foster_applications","users"]',
  'companionscpas',
  'companionscpas',
  'companionsofcaddo.org',
  '["/static/js/donate-modal.js","src/index.js","render_page.js","render_section.js"]',
  '["/","/about","/adopt","/community","/donate","/services","POST /api/donations/checkout","POST /api/webhooks/stripe"]',
  NULL,
  'IAM canonical client context (623). Client D1 agentsam_project_context: keep ctx_companionscpas_cms_publish_v1 + ctx_cpas_donation_modal_session; archive duplicates via migration 624.',
  unixepoch(),
  unixepoch(),
  unixepoch()
);

UPDATE agentsam_project_context
SET status = 'archived',
    priority = 0,
    notes = COALESCE(notes, '') || ' | Archived 623 — superseded by ctx_companionscpas.',
    updated_at = unixepoch()
WHERE id = 'ctx_f72a887a8da9b004'
  AND id != 'ctx_companionscpas';

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_companionscpas_stripe_elements_donation_live_2026_06',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'state',
  'companionscpas_stripe_elements_donation_live_2026_06',
  'CompanionsCPAS Stripe Elements in-modal donation flow is live on companionsofcaddo.org (Jun 2026). Flow: Support Our Mission on /donate → donate-modal.js → campaign + amount → Stripe PaymentElement inline (mode elements) → confirm in-modal; hosted Checkout fallback (mode checkout). API: POST /api/donations/checkout returns client_secret (elements) or checkout_url (checkout). Stripe webhook destination we_1ThIx5RGnRsvqnfiDsw6zLfE at POST /api/webhooks/stripe; events payment_intent.succeeded, payment_intent.payment_failed, checkout.session.completed, charge.refunded; API version 2026-04-22.dahlia. Deploy: git b591b34, worker 446c6431; CPAS D1 ctx_cpas_donation_modal_session priority 80. Active campaigns: campaign_companions_second_chances_2026, camp_medical, camp_food, camp_transport. D1 audit 2026-06-12: donation_intents=2, donations=0, stripe_webhooks=0 — pending $1 smoke to verify signing secret and row persistence.',
  'CompanionsCPAS Stripe Elements donation — live Jun 2026',
  'Elements in-modal on /donate; webhook we_1ThIx5RGnRsvqnfiDsw6zLfE; D1 donations/webhooks rows still zero — run smoke.',
  'project_brief_20260612',
  '["companionscpas","donations","stripe","elements","webhook","production","jun2026"]',
  1.0,
  9,
  1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:companionscpas_stripe_elements_donation_live_2026_06',
  unixepoch()
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  title = excluded.title,
  summary = excluded.summary,
  workspace_id = excluded.workspace_id,
  memory_type = excluded.memory_type,
  source = excluded.source,
  tags = excluded.tags,
  importance = excluded.importance,
  is_pinned = excluded.is_pinned,
  sync_key = excluded.sync_key,
  updated_at = unixepoch();
