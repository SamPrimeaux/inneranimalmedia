-- 626: Record CompanionsCPAS Stripe Elements donation smoke passed (2026-06-12).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/626_companionscpas_donation_smoke_memory.sql

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_companionscpas_stripe_elements_donation_live_2026_06',
  'tenant_sam_primeaux', 'au_871d920d1233cbd1', 'ws_inneranimalmedia',
  'state', 'companionscpas_stripe_elements_donation_live_2026_06',
  'CompanionsCPAS Stripe Elements in-modal donation flow is live and smoke-tested on companionsofcaddo.org (Jun 2026). SMOKE PASSED 2026-06-12 13:12:05 UTC: PaymentIntent pi_3ThUsRRGnRsvqnfi1kMVqPb5 — $30.00 succeeded. stripe_webhooks + donations rows confirmed. Dual-event duplicate row — fix idempotency.',
  'CompanionsCPAS Stripe Elements donation — live, smoke passed 2026-06-12',
  'Smoke passed 2026-06-12: pi_3ThUsRRGnRsvqnfi1kMVqPb5 $30; stripe_webhooks + donations rows confirmed.',
  'donation_smoke_20260612',
  '["companionscpas","donations","stripe","elements","webhook","production","jun2026","smoke-passed"]',
  1.0, 9, 1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:companionscpas_stripe_elements_donation_live_2026_06',
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  value = excluded.value, title = excluded.title, summary = excluded.summary,
  source = excluded.source, tags = excluded.tags, importance = excluded.importance,
  is_pinned = excluded.is_pinned, sync_key = excluded.sync_key, updated_at = unixepoch();
