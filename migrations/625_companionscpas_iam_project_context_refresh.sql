-- 625: Refresh canonical IAM client row ctx_companionscpas (ws_inneranimalmedia).
-- Synced from docs/clients/companionscpas/project-brief.md + migrations 623/624 (2026-06-12).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/625_companionscpas_iam_project_context_refresh.sql

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
  mcp_services_involved,
  key_files,
  related_routes,
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
  'CompanionsCPAS production platform for Companions of CPAS (Caddo Parish nonprofit dog rescue). Worker companionscpas → companionsofcaddo.org (origin: companionscpas.meauxbility.workers.dev). Repo: github.com/SamPrimeaux/companionscpas. Client identity: tenant_companionscpas / ws_companionscpas. Bindings: D1 companionscpas (fd6dd6fb), R2 companionscpas, KV companionscpas-cache, cron 0 6 * * *. Publish contract: D1 → R2 → KV → verify on companionsofcaddo.org. CMS (2026-06-12): 6 published routes; 25 publish jobs done. Animals 19, fosters 4, users 6. Donations: Stripe Elements in-modal on /donate (b591b34, worker 446c6431); POST /api/donations/checkout; webhook we_1ThIx5RGnRsvqnfiDsw6zLfE → POST /api/webhooks/stripe. IAM RAG: docs/clients/companionscpas/project-brief.md ingested (10 chunks → AGENTSAM_VECTORIZE_DOCUMENTS + pgvector); lane client_project_semantic_search. IAM memory: companionscpas_* pack + companionscpas_stripe_elements_donation_live_2026_06.',
  '["P0: $1 Stripe Elements donation smoke — stripe_webhooks + donations rows","P1: Enable worker observability (logs/traces currently disabled)","P1: Verify META_APP_ID / META_APP_SECRET non-empty","P2: cms_publish_artifacts tracking gap","P2: Finish assets.companionsofcaddo.org migration off assets.meauxxx.com","P3: Client UAT — CMS publish, foster flow, board dashboard"]',
  '["Client worker/repo separate from IAM; CPAS D1 is runtime source of truth for CMS/donations","Dashboard CMS publish only — no ad-hoc production HTML","Every public route: site-main + data-route + shared.css/shared.js","Policy memory: companionscpas_non_negotiable_change_sync_contract","RAG: client_project_semantic_search reads IAM docs+memory, not CPAS D1 project_context"]',
  '["Donation pipeline unproven: donations=0, stripe_webhooks=0 (2026-06-12)","Worker observability disabled — enable before webhook debug","cms_publish_artifacts empty despite 25 done publish jobs","Meta OAuth plaintext secrets need value verification"]',
  '["cms_pages","cms_publish_jobs","donation_intents","donations","stripe_webhooks","fundraising_campaigns","animal_profiles","cpas_foster_applications","users"]',
  '["donation_payments","donors","donation_settings","agentsam_project_context","agentsam_memory"]',
  'companionscpas',
  'companionscpas',
  'companionsofcaddo.org,companionscpas.meauxbility.workers.dev,assets.companionsofcaddo.org',
  NULL,
  '["docs/clients/companionscpas/project-brief.md","/static/js/donate-modal.js","src/index.js","render_page.js","render_section.js","scripts/ingest_client_project_doc.mjs"]',
  '["/","/about","/adopt","/community","/donate","/services","POST /api/donations/checkout","POST /api/webhooks/stripe","/dashboard?view=cms"]',
  'IAM canonical client row (625). Brief ingested 2026-06-12. CPAS D1 context consolidated (624): active ctx_companionscpas_cms_publish_v1 + ctx_cpas_donation_modal_session; 5 legacy rows archived. Supersedes archived ctx_f72a887a8da9b004.',
  unixepoch(),
  COALESCE((SELECT created_at FROM agentsam_project_context WHERE id = 'ctx_companionscpas'), unixepoch()),
  unixepoch()
);
