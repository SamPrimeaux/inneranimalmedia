-- 626: Record CompanionsCPAS Stripe Elements donation smoke passed (2026-06-12).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/626_companionscpas_donation_smoke_memory.sql

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
  'CompanionsCPAS Stripe Elements in-modal donation flow is live and smoke-tested on companionsofcaddo.org (Jun 2026).

Flow: Support Our Mission on /donate → donate-modal.js → campaign + amount → Stripe PaymentElement (mode elements) → confirm in-modal; hosted Checkout fallback (mode checkout).

API: POST /api/donations/checkout — elements returns client_secret; checkout returns checkout_url.

Stripe webhook destination we_1ThIx5RGnRsvqnfiDsw6zLfE → POST /api/webhooks/stripe (events: payment_intent.succeeded, payment_intent.payment_failed, checkout.session.completed, charge.refunded).

SMOKE PASSED 2026-06-12 13:12:05 UTC:
- PaymentIntent pi_3ThUsRRGnRsvqnfi1kMVqPb5 — $30.00 (3000 cents) succeeded
- stripe_webhooks: payment_intent.succeeded + checkout.session.completed — both status processed
- donations row created (succeeded)
- Worker secret STRIPE_WEBHOOK_SECRET rotated; deploy 070fcadb-c51b-4874-840a-958553ce1fa5

Known follow-up: dual webhook events can insert duplicate donations rows (same stripe_payment_intent_id) — add PI idempotency guard on checkout.session.completed in companionscpas payments_email.js.

Active campaigns: campaign_companions_second_chances_2026, camp_medical, camp_food, camp_transport.',
  'CompanionsCPAS Stripe Elements donation — live, smoke passed 2026-06-12',
  'Smoke passed 2026-06-12: pi_3ThUsRRGnRsvqnfi1kMVqPb5 $30; stripe_webhooks + donations rows confirmed. Dual-event duplicate row — fix idempotency.',
  'donation_smoke_20260612',
  '["companionscpas","donations","stripe","elements","webhook","production","jun2026","smoke-passed"]',
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
  source = excluded.source,
  tags = excluded.tags,
  importance = excluded.importance,
  is_pinned = excluded.is_pinned,
  sync_key = excluded.sync_key,
  updated_at = unixepoch();
