-- Public /pricing page products (see public-pages/pricing.html tabs):
--   AI Client Assistant — $150/mo recurring
--   Advanced Analytics — $200/mo recurring
--
-- stripe_price_id: placeholder strings until Products + monthly recurring Prices exist in Stripe.
-- After creating them in the Stripe Product catalog, UPDATE each row with the real price_... id:
--   UPDATE billing_plans SET stripe_price_id = 'price_XXX', updated_at = datetime('now') WHERE id = 'ai_client_assistant';
--   UPDATE billing_plans SET stripe_price_id = 'price_XXX', updated_at = datetime('now') WHERE id = 'advanced_analytics';
--
-- Webhook (Workers Secret STRIPE_WEBHOOK_SECRET with signing secret whsec_... from Stripe Dashboard):
--   https://inneranimalmedia.com/api/webhooks/stripe
--   Events: checkout.session.completed, customer.subscription.updated,
--            customer.subscription.deleted, invoice.payment_failed
--
-- Remote apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/249_billing_plans_public_pricing_products.sql

INSERT INTO billing_plans (
  id,
  name,
  stripe_price_id,
  monthly_token_limit,
  daily_request_limit,
  max_concurrency,
  features_json,
  is_active,
  created_at,
  updated_at,
  allows_byok,
  allows_usage_billing,
  free_tier_models_json,
  billing_period,
  trial_days,
  sort_order,
  display_name,
  tagline
) VALUES
(
  'ai_client_assistant',
  'AI Client Assistant',
  'price_placeholder_pricing_ai_client_assistant_150_mo',
  0,
  0,
  1,
  '{"public_pricing":{"path":"/pricing","tab":"ai-assistant","usd_monthly":150}}',
  1,
  datetime('now'),
  datetime('now'),
  0,
  0,
  '[]',
  'monthly',
  0,
  15,
  'AI Client Assistant',
  'Nurtures leads and auto-responds to client inquiries, form submissions, and common questions.'
),
(
  'advanced_analytics',
  'Advanced Analytics',
  'price_placeholder_pricing_advanced_analytics_200_mo',
  0,
  0,
  1,
  '{"public_pricing":{"path":"/pricing","tab":"analytics","usd_monthly":200}}',
  1,
  datetime('now'),
  datetime('now'),
  0,
  0,
  '[]',
  'monthly',
  0,
  16,
  'Advanced Analytics',
  'Enterprise-level reporting, BI, funnels, and real-time dashboards.'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  monthly_token_limit = excluded.monthly_token_limit,
  daily_request_limit = excluded.daily_request_limit,
  max_concurrency = excluded.max_concurrency,
  features_json = excluded.features_json,
  is_active = excluded.is_active,
  updated_at = datetime('now'),
  allows_byok = excluded.allows_byok,
  allows_usage_billing = excluded.allows_usage_billing,
  free_tier_models_json = excluded.free_tier_models_json,
  billing_period = excluded.billing_period,
  trial_days = excluded.trial_days,
  sort_order = excluded.sort_order,
  display_name = excluded.display_name,
  tagline = excluded.tagline;
